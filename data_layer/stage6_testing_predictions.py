# =============================
# Stage 6 — testing.py
# Goal: 以 set_test 建 Y（用 kmeans_clients），評估各分類器與投票模型
# 並輸出每筆樣本的機率（含模型名稱）
# =============================

import warnings, json
from pathlib import Path

import numpy as np
import pandas as pd
import joblib
from sklearn import metrics


warnings.filterwarnings("ignore")

DATA_LAYER_DIR = Path(__file__).resolve().parent
ARTIFACTS = DATA_LAYER_DIR / "artifacts"
ARTIFACTS.mkdir(parents=True, exist_ok=True)
OBJECTS = ARTIFACTS / "objects"
OBJECTS.mkdir(parents=True, exist_ok=True)

# ---- 載入 Stage 4 產出的 test 資料 ----
set_test = pd.read_csv(ARTIFACTS / "stage4_set_test.csv")

# ---- 依使用者聚合，重建 test 期間的 transactions_per_user（含時間校正）----
transactions_per_user = set_test.groupby(by=['CustomerID'])['Basket Price'].agg(['count', 'min', 'max', 'mean', 'sum'])
for i in range(5):
    col = f'categ_{i}'
    transactions_per_user.loc[:, col] = (
        set_test.groupby(by=['CustomerID'])[col].sum() / transactions_per_user['sum'] * 100
    )
transactions_per_user.reset_index(drop=False, inplace=True)

# 時間範圍校正（與筆記一致）
transactions_per_user['count'] = 5 * transactions_per_user['count']
transactions_per_user['sum']   = transactions_per_user['count'] * transactions_per_user['mean']

# ---- 以 kmeans_clients 給 test 客戶貼 Y 標籤（跟 Section 4 同步）----
list_cols = ['count','min','max','mean','categ_0','categ_1','categ_2','categ_3','categ_4']
matrix_test = transactions_per_user[list_cols].values
def _load_obj(name):
    path1 = OBJECTS / name
    path2 = ARTIFACTS / name
    if path1.exists():
        return joblib.load(path1)
    return joblib.load(path2)

# Try to use a saved kmeans + scaler if available and compatible with the
# constructed test matrix. If not available (or incompatible), fall back to
# using the `cluster` mapping already present in `set_test` (produced by
# Stage 4) to obtain Y labels.
def _try_kmeans_y(mat):
    try:
        scaler = _load_obj('scaler.pkl')
        kmeans_clients = _load_obj('kmeans_clients.pkl')
        # check scaler compatibility (scikit-learn stores n_features_in_)
        if hasattr(scaler, 'n_features_in_') and scaler.n_features_in_ != mat.shape[1]:
            return None
        scaled = scaler.transform(mat)
        return kmeans_clients.predict(scaled)
    except Exception:
        return None

Y = _try_kmeans_y(matrix_test)
if Y is None:
    # fallback: use cluster mapping from set_test (Stage 4 saved this)
    if 'cluster' in set_test.columns:
        mapping = (
            set_test.groupby('CustomerID')['cluster']
            .agg(lambda x: x.mode().iloc[0] if not x.mode().empty else 7)
            .to_dict()
        )
        Y = transactions_per_user['CustomerID'].map(mapping).fillna(7).astype(int).values
    else:
        raise RuntimeError('Cannot determine Y: missing kmeans_clients and no cluster column in set_test')

# ---- 分類器用的特徵（與 Section 5 一致）----
feat_cols = ['mean', 'categ_0', 'categ_1', 'categ_2', 'categ_3', 'categ_4']
X   = transactions_per_user[feat_cols].values
ids = transactions_per_user['CustomerID'].values

# ---- 載入已訓練的最佳模型 ----
svc = _load_obj('svc_best.pkl')
lr  = _load_obj('lr_best.pkl')
knn = _load_obj('knn_best.pkl')
tr  = _load_obj('tr_best.pkl')
rf  = _load_obj('rf_best.pkl')
gb  = _load_obj('gb_best.pkl')
votingC = _load_obj('votingC.pkl')

classifiers = [
    (svc, 'Support Vector Machine'),
    (lr,  'Logistic Regression'),
    (knn, 'k-Nearest Neighbors'),
    (tr,  'Decision Tree'),
    (rf,  'Random Forest'),
    (gb,  'Gradient Boosting'),
]


# ---- 安全機率：沒有 predict_proba 時用 decision_function → softmax ----
def _safe_predict_proba(est, X):
    if hasattr(est, "predict_proba"):
        return est.predict_proba(X)
    if hasattr(est, "decision_function"):
        scores = est.decision_function(X)
        scores = np.atleast_2d(scores)
        if scores.shape[1] == 1:
            scores = np.c_[-scores, scores]
        e = np.exp(scores - scores.max(axis=1, keepdims=True))
        return e / e.sum(axis=1, keepdims=True)
    # fallback：one-hot
    preds = est.predict(X)
    classes = getattr(est, "classes_", np.unique(preds))
    proba = np.zeros((len(preds), len(classes)))
    for i, c in enumerate(classes):
        proba[preds == c, i] = 1.0
    return proba

# 以 test 期的實際客群分佈定義統一的類別欄位順序
classes_all = np.unique(Y)

# ---- 評估 + 機率輸出（含模型名稱）----
stage6_scores = {}
proba_frames = []
pred_rows = []

for clf, label in classifiers:
    pred = clf.predict(X)
    acc = float(metrics.accuracy_score(Y, pred))
    stage6_scores[label] = acc
    print('_' * 30, f"\n{label}\nPrecision: {acc*100:.2f} %")

    # 機率（補齊到 classes_all）
    proba = _safe_predict_proba(clf, X)
    model_classes = getattr(clf, 'classes_', np.unique(pred))
    col_map = {int(c): j for j, c in enumerate(model_classes)}
    proba_full = np.zeros((proba.shape[0], len(classes_all)), dtype=float)
    for idx_c, c in enumerate(classes_all):
        j = col_map.get(int(c), None)
        if j is not None:
            proba_full[:, idx_c] = proba[:, j]

    dfp = pd.DataFrame(proba_full, columns=[f"p_{int(c)}" for c in classes_all])
    dfp.insert(0, 'model', label)
    dfp.insert(1, 'CustomerID', ids)
    dfp.insert(2, 'y_true', Y)
    dfp.insert(3, 'y_pred', pred)
    proba_frames.append(dfp)

    pred_rows.append(pd.DataFrame({
        'model': label, 'CustomerID': ids, 'y_true': Y, 'y_pred': pred
    }))

# ---- Voting (RF+GB+KNN, soft) ----
pred_vote = votingC.predict(X)
vote_acc  = float(metrics.accuracy_score(Y, pred_vote))
print(f"Voting (RF+GB+KNN) Precision: {vote_acc*100:.2f} %")
stage6_scores['Voting_RF_GB_KNN'] = vote_acc

proba_vote = _safe_predict_proba(votingC, X)
model_classes = getattr(votingC, 'classes_', np.unique(pred_vote))
col_map = {int(c): j for j, c in enumerate(model_classes)}
proba_full = np.zeros((proba_vote.shape[0], len(classes_all)), dtype=float)
for idx_c, c in enumerate(classes_all):
    j = col_map.get(int(c), None)
    if j is not None:
        proba_full[:, idx_c] = proba_vote[:, j]

dfp = pd.DataFrame(proba_full, columns=[f"p_{int(c)}" for c in classes_all])
dfp.insert(0, 'model', 'Voting (RF+GB+KNN)')
dfp.insert(1, 'CustomerID', ids)
dfp.insert(2, 'y_true', Y)
dfp.insert(3, 'y_pred', pred_vote)
proba_frames.append(dfp)

pred_rows.append(pd.DataFrame({
    'model': 'Voting (RF+GB+KNN)', 'CustomerID': ids, 'y_true': Y, 'y_pred': pred_vote
}))

# ---- 存檔 ----
with open(ARTIFACTS / 'stage6_eval.json', 'w', encoding='utf-8') as f:
    json.dump(stage6_scores, f, indent=2, ensure_ascii=False)

pd.concat(proba_frames, ignore_index=True).to_csv(ARTIFACTS / 'stage6_pred_proba.csv', index=False)
pd.concat(pred_rows,  ignore_index=True).to_csv(ARTIFACTS / 'stage6_predictions.csv', index=False)

print('[Stage 6] Saved: stage6_eval.json, stage6_pred_proba.csv, stage6_predictions.csv in artifacts/')
