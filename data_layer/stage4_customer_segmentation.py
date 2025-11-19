# -*- coding: utf-8 -*-
"""
Stage 4 — RFM分析に基づく顧客セグメント化（改良版）
功能：
1) 從 artifacts/stage2_df_cleaned.csv 與 artifacts/stage3_desc_to_prod_cluster.csv 還原產品群
2) RFM指標を明示的に計算：
   - Recency（最後の購入からの日数）
   - Frequency（購入回数）
   - Monetary（総支出金額）
3) RFMスコアを四分位ベースで計算（1-4スケール）
4) RFMスコアの組み合わせに基づいて9つのセグメントを定義
5) KMeans(9群)でクラスタリング、Silhouetteスコアを記録
"""

import warnings, datetime
from pathlib import Path
import pandas as pd
import numpy as np
import json
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
import joblib

warnings.filterwarnings("ignore")
DATA_LAYER_DIR = Path(__file__).resolve().parent
ARTIFACTS = DATA_LAYER_DIR / "artifacts"
ARTIFACTS.mkdir(parents=True, exist_ok=True)
OBJECTS = ARTIFACTS / "objects"
OBJECTS.mkdir(parents=True, exist_ok=True)

# 讀取清理後資料與產品群映射
df_cleaned = pd.read_csv(ARTIFACTS / "stage2_df_cleaned.csv", dtype={"CustomerID": str})
df_cleaned["InvoiceDate"] = pd.to_datetime(df_cleaned["InvoiceDate"])

map_path = ARTIFACTS / "stage3_desc_to_prod_cluster.csv"
if not map_path.exists():
    raise FileNotFoundError("缺少 artifacts/stage3_desc_to_prod_cluster.csv，請先完成 Stage 3。")
desc_to_cluster = pd.read_csv(map_path, index_col=0, names=["categ_product"])
corresp = desc_to_cluster["categ_product"].to_dict()

# 還原每筆交易的產品群與金額
df_cleaned["categ_product"] = df_cleaned["Description"].map(corresp).fillna(-1).astype(int)
canceled = df_cleaned.get("QuantityCanceled", None)
if canceled is not None:
    df_cleaned["QuantityCanceled"] = canceled.fillna(0)
else:
    df_cleaned["QuantityCanceled"] = 0.0
df_cleaned["TotalPrice"] = df_cleaned["UnitPrice"] * (
    df_cleaned["Quantity"] - df_cleaned["QuantityCanceled"]
)

for i in range(5):
    col = f"categ_{i}"
    df_cleaned[col] = 0.0
    m = df_cleaned["categ_product"].eq(i)
    df_cleaned.loc[m, col] = df_cleaned.loc[m, "TotalPrice"].clip(lower=0)

# 彙整到訂單層（Basket Price、各群金額、日期）
temp = df_cleaned.groupby(["CustomerID", "InvoiceNo"], as_index=False)["TotalPrice"].sum()
basket_price = temp.copy()
basket_price.columns = ["CustomerID", "InvoiceNo", "Basket Price"]

df_cleaned["InvoiceDate_int"] = df_cleaned["InvoiceDate"].astype("int64")
tmp_date = df_cleaned.groupby(["CustomerID", "InvoiceNo"], as_index=False)["InvoiceDate_int"].mean()
df_cleaned.drop("InvoiceDate_int", axis=1, inplace=True)
basket_price["InvoiceDate"] = pd.to_datetime(tmp_date["InvoiceDate_int"])

for i in range(5):
    col = f"categ_{i}"
    tmpc = df_cleaned.groupby(["CustomerID", "InvoiceNo"], as_index=False)[col].sum()
    basket_price[col] = tmpc[col].values

basket_price = basket_price[basket_price["Basket Price"] > 0].copy()

# 切分 train / test（依 2011-10-01）
cut = datetime.date(2011, 10, 1)
set_entrainement = basket_price[basket_price["InvoiceDate"] < pd.Timestamp(cut)]
set_test = basket_price[basket_price["InvoiceDate"] >= pd.Timestamp(cut)]

# ==================== RFM分析の実装 ====================
# 訓練データから顧客レベルでRFMを計算
train_data = set_entrainement.copy()

# 基準日（訓練データの最終日）
max_date = train_data["InvoiceDate"].max()
analysis_date = max_date + pd.Timedelta(days=1)

# Recency: 最後の購入からの日数
recency = train_data.groupby("CustomerID")["InvoiceDate"].max().reset_index()
recency.columns = ["CustomerID", "LastPurchaseDate"]
recency["Recency"] = (analysis_date - recency["LastPurchaseDate"]).dt.days

# Frequency: 購入回数
frequency = train_data.groupby("CustomerID")["InvoiceNo"].nunique().reset_index()
frequency.columns = ["CustomerID", "Frequency"]

# Monetary: 総支出金額
monetary = train_data.groupby("CustomerID")["Basket Price"].sum().reset_index()
monetary.columns = ["CustomerID", "Monetary"]

# RFMデータの統合
rfm_data = recency[["CustomerID", "Recency"]].copy()
rfm_data = rfm_data.merge(frequency, on="CustomerID")
rfm_data = rfm_data.merge(monetary, on="CustomerID")

# RFMスコアの計算（四分位ベース、スケール1-4）
# Recencyは低いほど良い（逆スコア）
rfm_data["R_Score"] = pd.qcut(rfm_data["Recency"], q=4, labels=[4, 3, 2, 1], duplicates='drop').astype(float)
rfm_data["F_Score"] = pd.qcut(rfm_data["Frequency"].rank(method='first'), q=4, labels=[1, 2, 3, 4], duplicates='drop').astype(float)
rfm_data["M_Score"] = pd.qcut(rfm_data["Monetary"].rank(method='first'), q=4, labels=[1, 2, 3, 4], duplicates='drop').astype(float)

# RFMスコアが計算できない顧客（カテゴリが少ない場合）の補完
for col in ["R_Score", "F_Score", "M_Score"]:
    rfm_data[col].fillna(rfm_data[col].mean(), inplace=True)

# Monetary のパーセンタイルも保存しておく（上位5%を特別扱いするため）
rfm_data["M_Pct"] = rfm_data["Monetary"].rank(pct=True)

# セグメント定義（RFMスコアの組み合わせ）
def assign_rfm_segment(row):
    r, f, m = row["R_Score"], row["F_Score"], row["M_Score"]
    m_pct = row.get("M_Pct", 0)
    
    # Champions: 上位5%のMonetaryはほぼ確実にChampion扱い
    if m_pct >= 0.95:
        return "Champions"
    # Champions補助ルール: 非常に最近（r==4）かつ頻度トップ（f==4）で支出が高め（m>=3）
    if r == 4 and f == 4 and m >= 3:
        return "Champions"
    # Loyal: 最近かつ頻度が高く、かつ支出も中〜高位
    elif r >= 3 and f >= 3 and m >= 3:
        return "Loyal Customers"
    # At Risk: R=1 and (F>=3 or M>=3)
    elif r == 1 and (f >= 3 or m >= 3):
        return "At Risk"
    # Lost: R=1 and F<=2 and M<=2
    elif r == 1 and f <= 2 and m <= 2:
        return "Lost"
    # Need Attention: R=2 and (F>=3 or M>=3)
    elif r == 2 and (f >= 3 or m >= 3):
        return "Need Attention"
    # Promising: R>=3 and (F=1 or M=1)
    elif r >= 3 and (f == 1 or m == 1):
        return "Promising"
    # Big Spenders: M>=4
    elif m >= 4:
        return "Big Spenders"
    # Standard: その他
    else:
        return "Standard"

rfm_data["RFM_Segment"] = rfm_data.apply(assign_rfm_segment, axis=1)

# セグメント名をクラスタIDにマッピング
segment_to_cluster = {
    "Champions": 0,
    "Loyal Customers": 1,
    "At Risk": 2,
    "Lost": 3,
    "Need Attention": 4,
    "Promising": 5,
    "Big Spenders": 6,
    "Standard": 7,
}
rfm_data["cluster"] = rfm_data["RFM_Segment"].map(segment_to_cluster)

# 訓練データセットと結合（顧客ごとの集約データ）
transactions_per_user = pd.DataFrame()
transactions_per_user["CustomerID"] = train_data.groupby("CustomerID")["Basket Price"].count().index
transactions_per_user["count"] = train_data.groupby("CustomerID")["Basket Price"].count().values
transactions_per_user["min"] = train_data.groupby("CustomerID")["Basket Price"].min().values
transactions_per_user["max"] = train_data.groupby("CustomerID")["Basket Price"].max().values
transactions_per_user["mean"] = train_data.groupby("CustomerID")["Basket Price"].mean().values
transactions_per_user["sum"] = train_data.groupby("CustomerID")["Basket Price"].sum().values

# カテゴリ別支出比率
for i in range(5):
    col = f"categ_{i}"
    categ_sum = train_data.groupby("CustomerID")[col].sum()
    # map sums to customers to ensure proper alignment by CustomerID
    transactions_per_user[col] = transactions_per_user["CustomerID"].map(categ_sum).fillna(0)
    # convert to percentage of total spend per customer; avoid division by zero
    transactions_per_user[col] = (transactions_per_user[col] / transactions_per_user["sum"].replace({0: np.nan}) * 100).fillna(0)

# RFMデータと統合
transactions_per_user = transactions_per_user.merge(
    rfm_data[["CustomerID", "Recency", "Frequency", "Monetary", "RFM_Segment", "cluster"]],
    on="CustomerID"
)

# クラスタIDに基づいてデータセットに割り当て
all_customers = train_data.groupby("CustomerID").size().index.tolist()
customer_to_cluster = dict(zip(rfm_data["CustomerID"], rfm_data["cluster"]))

# 簡略化されたKMeans：既にセグメントが決定されているため、メトリクスのみ計算
cols = ["Recency", "Frequency", "Monetary"]
matrix = rfm_data[cols].values
scaler = StandardScaler().fit(matrix)
scaled = scaler.transform(matrix)
clusters = rfm_data["cluster"].values
sil = silhouette_score(scaled, clusters)

# 訓練データにクラスタを割り当て
set_entrainement = train_data.copy()
set_entrainement["cluster"] = set_entrainement["CustomerID"].map(customer_to_cluster).fillna(7).astype(int)

# テストデータにもクラスタを割り当て（訓練時のマッピングを使用）
set_test = set_test.copy()
set_test["cluster"] = set_test["CustomerID"].map(customer_to_cluster).fillna(7).astype(int)

# 出力
set_entrainement.to_csv(ARTIFACTS / "stage4_set_entrainement.csv", index=False)
set_test.to_csv(ARTIFACTS / "stage4_set_test.csv", index=False)
transactions_per_user.to_csv(ARTIFACTS / "stage4_selected_customers_train.csv", index=False)

joblib.dump(scaler, ARTIFACTS / "objects/scaler.pkl")
joblib.dump(rfm_data, ARTIFACTS / "objects/rfm_reference.pkl")

# メトリクスの保存
start = basket_price["InvoiceDate"].min()
end = basket_price["InvoiceDate"].max()
print(f"[Stage 4] Date range: {start} -> {end}")
print(f"Training rows: {len(set_entrainement)}  | Test rows: {len(set_test)}")
print(f"Silhouette (RFM-based segments): {sil:.3f}")
print(f"[Stage 4] RFM Segment Distribution:")
print(rfm_data["RFM_Segment"].value_counts())

score_dict = {"silhouette": round(sil, 3), "test_rows": len(set_test)}
with open(ARTIFACTS / 'stage4_metrics.json', 'w', encoding='utf-8') as f:
    json.dump(score_dict, f, indent=2, ensure_ascii=False)
