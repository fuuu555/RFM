# -*- coding: utf-8 -*-
"""
4_fast.py — Stage 4（快速版；不產生圖表）
功能：
1) 從 artifacts/df_cleaned.csv 與 artifacts/desc_to_prod_cluster.csv 還原產品群（categ_product）
2) 彙整到訂單與使用者層，切分 train/test（2011-10-01）
3) StandardScaler + KMeans(11群)
4) 存檔五個成果檔
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
df_cleaned["QuantityCanceled"] = df_cleaned.get("QuantityCanceled", 0).fillna(0)
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
basket_price = temp.rename(columns={"TotalPrice": "Basket Price"})

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

# 使用者層彙總（count/min/max/mean/sum 與各產品群百分比）
bp = set_entrainement.copy(deep=True)
transactions_per_user = bp.groupby("CustomerID")["Basket Price"].agg(["count", "min", "max", "mean", "sum"])
for i in range(5):
    col = f"categ_{i}"
    transactions_per_user[col] = bp.groupby("CustomerID")[col].sum() / transactions_per_user["sum"] * 100
transactions_per_user.reset_index(drop=False, inplace=True)

# 標準化 + KMeans(11群)
cols = ["count", "min", "max", "mean", "categ_0", "categ_1", "categ_2", "categ_3", "categ_4"]
matrix = transactions_per_user[cols].values
scaler = StandardScaler().fit(matrix)
scaled = scaler.transform(matrix)
kmeans = KMeans(init="k-means++", n_clusters=11, n_init=100).fit(scaled)
clusters = kmeans.predict(scaled)
sil = silhouette_score(scaled, clusters)

# 輸出成果檔
set_entrainement.to_csv(ARTIFACTS / "stage4_set_entrainement.csv", index=False)
set_test.to_csv(ARTIFACTS / "stage4_set_test.csv", index=False)
transactions_per_user.assign(cluster=clusters).to_csv(
    ARTIFACTS / "stage4_selected_customers_train.csv", index=False
)
joblib.dump(scaler, ARTIFACTS / "scaler.pkl")
joblib.dump(kmeans, ARTIFACTS / "kmeans_clients.pkl")
# 同步存到 artifacts/objects/，保持目錄整潔
try:
    joblib.dump(scaler, OBJECTS / "scaler.pkl")
    joblib.dump(kmeans, OBJECTS / "kmeans_clients.pkl")
    # Remove duplicates from artifacts root if present
    for _p in [ARTIFACTS / "scaler.pkl", ARTIFACTS / "kmeans_clients.pkl"]:
        try:
            if _p.exists():
                _p.unlink()
        except Exception:
            pass
except Exception as _e:
    print(f"[Stage 4] Warning: failed to save models to artifacts/objects/: {_e}")

# 僅輸出指定四行（英文；逐行換行）
start = basket_price["InvoiceDate"].min()
end = basket_price["InvoiceDate"].max()
print(f"[Stage 4] Date range: {start} -> {end}")
print(f"Training rows: {len(set_entrainement)}  | Test rows: {len(set_test)}")
print(f"Silhouette (11 clusters): {sil:.3f}")


score_dict = {"silhouette": round(sil, 3), "test_rows": len(set_test)}
with open(ARTIFACTS / 'stage4_metrics.json', 'w', encoding='utf-8') as f:
    json.dump(score_dict, f, indent=2, ensure_ascii=False)