# Stage 3 — 商品分群（Product Clustering）
# - 從 Description 擷取名詞並詞幹化（hearts → heart）。
# - 特徵 = 語意 One‑Hot + 價格區間 One‑Hot（可解釋、可追溯）。
# - 使用 KMeans(k=5) 分群，並以 silhouette ≥ 0.145 作為最低品質線。
# - 輸出：
#   * artifacts/stage3_desc_to_prod_cluster.csv（商品 → 群代號，供後續 join）
#   * artifacts/objects/products_clusters.npy（群編號陣列）
#   * artifacts/objects/kmeans_products.pkl（模型本體）
#   * artifacts/objects/X_products.pkl（特徵矩陣，用於審計/再訓練）

import warnings
from pathlib import Path

import numpy as np
import pandas as pd

import nltk
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
import joblib

warnings.filterwarnings("ignore")

# ----------------------------------------------------
# NLTK 資源準備：用來做 tokenization + 詞性標註（POS tagging）
# 若本機沒有，就會自動下載一次
# ----------------------------------------------------
try:
    nltk.data.find("tokenizers/punkt")
except LookupError:
    nltk.download("punkt")
try:
    nltk.data.find("taggers/averaged_perceptron_tagger")
except LookupError:
    try:
        nltk.download("averaged_perceptron_tagger")
    except:
        nltk.download("averaged_perceptron_tagger_eng")

# ----------------------------------------------------
# 輸入資料：df_cleaned.csv（上一階段 Stage 2 已清洗與沖銷）
# ----------------------------------------------------
DATA_LAYER_DIR = Path(__file__).resolve().parent
ARTIFACTS = DATA_LAYER_DIR / "artifacts"
ARTIFACTS.mkdir(parents=True, exist_ok=True)
OBJECTS = ARTIFACTS / "objects"
OBJECTS.mkdir(parents=True, exist_ok=True)

df_cleaned = pd.read_csv(ARTIFACTS / "stage2_df_cleaned.csv", dtype={"CustomerID": str})

# 嘗試轉日期（非必要，但保持一致性）
if "InvoiceDate" in df_cleaned.columns:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        try:
            df_cleaned["InvoiceDate"] = pd.to_datetime(df_cleaned["InvoiceDate"])
        except:
            pass

# 取得**唯一商品描述列表**，每個描述視為一種商品
df_produits = pd.DataFrame(
    df_cleaned["Description"].dropna().unique(), columns=["Description"]
)

# ----------------------------------------------------
# 3.1 產品描述 → 名詞關鍵字提取
# Strategy:
#   - 將每個 Description 分詞
#   - 詞性標註（POS tagging）
#   - 只保留名詞（避免動詞形容詞造成噪音）
#   - 詞幹化（hearts → heart, metals → metal）
#   - 挑「最短單字」做為代表詞（避免欄位名混亂）
# ----------------------------------------------------
is_noun = lambda pos: pos[:2] == "NN"

def keywords_inventory(dataframe, colonne="Description"):
    stemmer = nltk.stem.SnowballStemmer("english")

    keywords_roots  = dict()  # 詞根 → 詞集合（如 metal → {metal, metals}）
    keywords_select = dict()  # 詞根 → 代表詞（最短者，例如 metal）
    category_keys   = []      # 代表詞列表
    count_keywords  = dict()  # 詞根出現頻次

    for s in dataframe[colonne]:
        if pd.isnull(s):
            continue

        # 全部轉小寫避免大小寫噪音
        lines = s.lower()

        # 分詞 + 詞性標註
        tokenized = nltk.word_tokenize(lines)
        nouns = [word for (word, pos) in nltk.pos_tag(tokenized) if is_noun(pos)]

        # 詞幹化 & 統計頻次
        for t in nouns:
            t = t.lower()
            racine = stemmer.stem(t)
            if racine in keywords_roots:
                keywords_roots[racine].add(t)
                count_keywords[racine] = count_keywords.get(racine, 0) + 1
            else:
                keywords_roots[racine] = {t}
                count_keywords[racine] = 1

    # 選擇每個詞根的「最短」詞作為特徵欄位名（避免欄名過長或混亂）
    for s in keywords_roots.keys():
        if len(keywords_roots[s]) > 1:
            min_length = 1000
            for k in keywords_roots[s]:
                if len(k) < min_length:
                    clef = k
                    min_length = len(k)
            category_keys.append(clef)
            keywords_select[s] = clef
        else:
            category_keys.append(list(keywords_roots[s])[0])
            keywords_select[s] = list(keywords_roots[s])[0]

    print("Nb of keywords in variable '{}': {}".format(colonne, len(category_keys)))
    return category_keys, keywords_roots, keywords_select, count_keywords

keywords, keywords_roots, keywords_select, count_keywords = keywords_inventory(df_produits)

# ----------------------------------------------------
# 3.2 關鍵詞過濾（降噪 + 控制欄位數）
# 過濾邏輯：
#   - 太短、太少見、太泛用的詞不要
#   - 去掉顏色詞（避免群形成「顏色叢集」）
#   - 去掉含 + 和 / 的字（多為規格噪音）
# ----------------------------------------------------
list_products = []
for k, v in count_keywords.items():
    word = keywords_select[k]
    if word in ["pink", "blue", "tag", "green", "orange"]:
        continue
    if len(word) < 3 or v < 13:
        continue
    if ("+" in word) or ("/" in word):
        continue
    list_products.append([word, v])

# 依頻次排序（不影響建模，但便於理解常見關鍵詞）
list_products.sort(key=lambda x: x[1], reverse=True)
print("mots conserves:", len(list_products))

# ----------------------------------------------------
# 3.3 建立 One-Hot 特徵矩陣 X
# 特徵 = 語意關鍵詞 one-hot + 價格區間 one-hot
# ----------------------------------------------------
liste_produits = df_cleaned["Description"].dropna().unique()
avg_price_lookup = (
    df_cleaned.groupby("Description", dropna=True)["UnitPrice"].mean().to_dict()
)
X = pd.DataFrame()

# 語意 one-hot：若描述中包含該關鍵詞，則為 1
for key, occurence in list_products:
    X.loc[:, key] = list(map(lambda x: int(key.upper() in x.upper()), liste_produits))

# 價格區間切點
threshold = [0, 1, 2, 3, 5, 10]
label_col = []

# 建立價格區間欄位
for i in range(len(threshold)):
    if i == len(threshold) - 1:
        col = ".>{}".format(threshold[i])
    else:
        col = "{}<.<{}".format(threshold[i], threshold[i + 1])
    label_col.append(col)
    X.loc[:, col] = 0

# 將每種商品分配到對應價格區間
for i, prod in enumerate(liste_produits):
    prix = avg_price_lookup.get(prod, 0.0)
    j = 0
    while j < len(threshold) and prix > threshold[j]:
        j += 1
        if j == len(threshold):
            break
    X.loc[i, label_col[j - 1]] = 1

# ----------------------------------------------------
# 3.4 KMeans 產品分群
#   - n_clusters=5（可調）
#   - 以 silhouette score 作為品質下限：≥ 0.145 才接受
# ----------------------------------------------------
matrix = X.values
n_clusters = 5
silhouette_avg = -1.0
kmeans_products = None

while silhouette_avg < 0.145:
    kmeans = KMeans(init="k-means++", n_clusters=n_clusters, n_init=30)
    kmeans.fit(matrix)
    clusters = kmeans.predict(matrix)
    silhouette_avg = silhouette_score(matrix, clusters)
    print("n_clusters =", n_clusters, "平均 silhouette_score =", silhouette_avg)
    kmeans_products = kmeans  # 保留此次模型

# 建立「描述 → 叢集」對應表（可直接 JOIN 回交易資料）
corresp = {key: val for key, val in zip(liste_produits, clusters)}

# ----------------------------------------------------
# 3.5 輸出工件（Artifacts）
# ----------------------------------------------------
np.save(ARTIFACTS / "products_clusters.npy", clusters)              # 每種產品的叢集編號
joblib.dump(kmeans_products, ARTIFACTS / "kmeans_products.pkl")     # 產品分群模型（未來可用於新商品）
pd.Series(corresp).to_csv(ARTIFACTS / "stage3_desc_to_prod_cluster.csv", header=["categ_product"])  # 對應表
X.to_pickle(ARTIFACTS / "X_products.pkl")                           # 訓練用特徵矩陣 X（審計／重跑用）

print("[Stage 3] 已輸出：CSV 至 artifacts/；npy/pkl 至 artifacts/objects/")
try:
    (ARTIFACTS / "objects").mkdir(exist_ok=True)
    np.save(ARTIFACTS / "objects" / "products_clusters.npy", clusters)
    joblib.dump(kmeans_products, ARTIFACTS / "objects" / "kmeans_products.pkl")
    X.to_pickle(ARTIFACTS / "objects" / "X_products.pkl")
    # Remove duplicates from artifacts root if present
    try:
        root_files = [
            ARTIFACTS / "products_clusters.npy",
            ARTIFACTS / "kmeans_products.pkl",
            ARTIFACTS / "X_products.pkl",
        ]
        for _p in root_files:
            try:
                if _p.exists():
                    _p.unlink()
            except Exception:
                pass
    finally:
        pass
    print("[Stage 3] 已保存 npy/pkl 至 artifacts/objects/，並已清理 artifacts 根目錄舊檔（若存在）")
except Exception as _e:
    print(f"[Stage 3] 警告：保存至 artifacts/objects 失敗：{_e}")
