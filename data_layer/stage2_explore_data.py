# 2_fast.py（Stage 2 —— 極速版，移除所有視覺化與中途輸出）
# 功能：在不改變原始邏輯的前提下，使用向量化（merge）完成「取消訂單沖銷」，
#       並產出 df_cleaned.csv 與 liste_produits.csv。終端機只印最後一行狀態。

import pandas as pd
import numpy as np
from pathlib import Path

# 準備輸出資料夾
DATA_LAYER_DIR = Path(__file__).resolve().parent
ARTIFACTS = DATA_LAYER_DIR / "artifacts"
ARTIFACTS.mkdir(parents=True, exist_ok=True)

# 讀取 Stage 1 清洗後資料
df_initial = pd.read_csv(ARTIFACTS / "stage1_df_initial_clean.csv", dtype={"CustomerID": str})
df_initial["InvoiceDate"] = pd.to_datetime(df_initial["InvoiceDate"])

# 複製並建立欄位：QuantityCanceled
df_cleaned = df_initial.copy(deep=True)
df_cleaned["QuantityCanceled"] = 0

# 取得負訂單（排除 Discount），並保留原始 index（供回填用）
df_neg = df_cleaned[(df_cleaned["Quantity"] < 0) & (df_cleaned["Description"] != "Discount")].reset_index()
df_neg = df_neg.rename(columns={"index": "index_neg"})
df_neg["AbsQuantity"] = -df_neg["Quantity"]

# 取得正訂單，保留原始 index
df_pos = df_cleaned[df_cleaned["Quantity"] > 0].reset_index()
df_pos = df_pos.rename(columns={"index": "index_pos"})

# 依原邏輯進行候選配對（同 CustomerID+StockCode；正單時間需早於負單）
pairs = pd.merge(
    df_neg[["index_neg", "CustomerID", "StockCode", "InvoiceDate", "AbsQuantity"]]
        .rename(columns={"InvoiceDate": "InvoiceDate_neg", "AbsQuantity": "AbsQuantity_neg"}),
    df_pos[["index_pos", "CustomerID", "StockCode", "InvoiceDate", "Quantity"]]
        .rename(columns={"InvoiceDate": "InvoiceDate_pos", "Quantity": "Quantity_pos"}),
    on=["CustomerID", "StockCode"],
    how="inner"
)
pairs = pairs[pairs["InvoiceDate_pos"] < pairs["InvoiceDate_neg"]]

# 僅保留「數量足夠」的正訂單（Quantity_pos >= AbsQuantity_neg）
pairs = pairs[pairs["Quantity_pos"] >= pairs["AbsQuantity_neg"]].copy()

# 對每筆負訂單，選擇「時間最近」的正訂單（依 index_neg 分組、InvoiceDate_pos 由近到遠）
pairs.sort_values(["index_neg", "InvoiceDate_pos"], ascending=[True, False], inplace=True)
final_matches = pairs.drop_duplicates(subset=["index_neg"], keep="first")

# 將配對成功的正訂單標記其被沖銷數量（QuantityCanceled = 負單絕對值）
if not final_matches.empty:
    df_cleaned.loc[final_matches["index_pos"].values, "QuantityCanceled"] = final_matches["AbsQuantity_neg"].values

# 計算需刪除的負訂單索引，以及無對應之可疑負訂單
entry_to_remove = final_matches["index_neg"].unique().tolist()
all_neg_indices = set(df_neg["index_neg"])
doubtful_indices = list(all_neg_indices - set(entry_to_remove))

# 刪除這些負訂單
if entry_to_remove:
    df_cleaned.drop(entry_to_remove, axis=0, inplace=True)
if doubtful_indices:
    df_cleaned.drop(doubtful_indices, axis=0, inplace=True)

# 刪除仍為負數且非 'D' 的剩餘異常列（與原始流程一致）
remaining_mask = (df_cleaned["Quantity"] < 0) & (df_cleaned["StockCode"] != "D")
if remaining_mask.any():
    df_cleaned = df_cleaned.loc[~remaining_mask].copy()

# 計算每列總價（供後續使用）
df_cleaned["TotalPrice"] = df_cleaned["UnitPrice"] * (df_cleaned["Quantity"] - df_cleaned["QuantityCanceled"])

# 輸出供後續階段使用
df_cleaned.to_csv(ARTIFACTS / "stage2_df_cleaned.csv", index=False)
pd.DataFrame(df_initial["Description"].unique(), columns=["Description"]).to_csv(
    ARTIFACTS / "stage2_liste_produits.csv", index=False
)

# 僅印最後一行狀態
print("[Stage 2] Saved: artifacts/stage2_df_cleaned.csv, artifacts/stage2_liste_produits.csv")
