#!/usr/bin/env python
# =============================
# Stage 7 explain_shap.py
# 目標：用 SHAP 解釋已訓練的分類器。
# - 載入 Stage 5 存好的模型
# - 以 Stage 6 的方式重建測試特徵
# - 計算 SHAP 值（自動選擇 Tree/Linear/Kernel）
# - 輸出特徵重要度（CSV）與摘要圖（PNG）到 artifacts/
# =============================

import warnings
from pathlib import Path
import json

import numpy as np
import pandas as pd
import joblib

warnings.filterwarnings("ignore")

DATA_LAYER_DIR = Path(__file__).resolve().parent
ARTIFACTS = DATA_LAYER_DIR / 'artifacts'
OBJECTS = ARTIFACTS / 'objects'
SET_TEST_PATH = ARTIFACTS / 'stage4_set_test.csv'
ARTIFACTS.mkdir(parents=True, exist_ok=True)
OBJECTS.mkdir(parents=True, exist_ok=True)


def _load_obj(name: str):
    p1 = OBJECTS / name
    p2 = ARTIFACTS / name
    if p1.exists():
        return joblib.load(p1)
    return joblib.load(p2)


def _rebuild_test_features():
    """重建與 Stage 6 一致的測試特徵。"""
    set_test = pd.read_csv(SET_TEST_PATH)

    transactions_per_user = set_test.groupby(by=['CustomerID'])['Basket Price'].agg(
        ['count', 'min', 'max', 'mean', 'sum']
    )
    for i in range(5):
        col = f'categ_{i}'
        transactions_per_user.loc[:, col] = (
            set_test.groupby(by=['CustomerID'])[col].sum()
            / transactions_per_user['sum'] * 100
        )
    transactions_per_user.reset_index(drop=False, inplace=True)

    # 與 Stage 6 一致的小幅正規化／縮放處理
    transactions_per_user['count'] = 5 * transactions_per_user['count']
    transactions_per_user['sum'] = transactions_per_user['count'] * transactions_per_user['mean']

    feat_cols = ['mean', 'categ_0', 'categ_1', 'categ_2', 'categ_3', 'categ_4']
    X = transactions_per_user[feat_cols].values
    ids = transactions_per_user['CustomerID'].values
    return X, feat_cols, ids


def _pick_background(X: np.ndarray, max_bg: int = 200, seed: int = 42):
    """為 SHAP（Kernel/Linear）挑選背景樣本。"""
    if X.shape[0] <= max_bg:
        return X
    rng = np.random.default_rng(seed)
    idx = rng.choice(X.shape[0], size=max_bg, replace=False)
    return X[idx]


def _ensure_shap():
    try:
        import shap  # noqa: F401
        return True
    except Exception as e:
        print("[Stage 7] 找不到 SHAP，請先安裝：")
        print("  pip install shap")
        print(f"原因：{e}")
        return False


def _compute_shap_for_model(name: str, model, X: np.ndarray, feature_names: list, out_dir: Path,
                            sample_explain: int = 500, ids: np.ndarray | None = None):
    """對單一模型計算 SHAP 並輸出結果。

    - 透過 shap.Explainer 自動選擇最佳演算法（Tree/Linear/Kernel）。
    - 輸出特徵重要度（CSV）與 SHAP 摘要圖（PNG）。
    - 對 Kernel 類 explainer 進行抽樣以控制運算時間。
    """
    import shap
    import matplotlib
    matplotlib.use('Agg')  # headless
    import matplotlib.pyplot as plt

    # 準備繪圖資料（可抽樣以提升效能）
    n = X.shape[0]
    if sample_explain and n > sample_explain:
        # For heavy explainers, explain a subset for plots
        idx_explain = np.random.default_rng(42).choice(n, size=sample_explain, replace=False)
        X_explain = X[idx_explain]
    else:
        X_explain = X
        idx_explain = np.arange(n)

    # 背景樣本（部分 explainer 需要）
    bg = _pick_background(X, max_bg=200)

    # 建立 explainer（shap.Explainer 會自動選擇對應後端）
    try:
        explainer = shap.Explainer(model, bg)
    except Exception:
        # 備援：先嘗試 TreeExplainer（樹模型），再退到 KernelExplainer
        explainer = None
        try:
            explainer = shap.TreeExplainer(model)
        except Exception:
            pass
        if explainer is None:
            try:
                # 有 predict_proba 則使用，否則改用 decision_function，再不行用 predict
                f = getattr(model, 'predict_proba', None) or getattr(model, 'decision_function', None)
                if f is None:
                    f = model.predict
                explainer = shap.KernelExplainer(f, bg)
            except Exception as e:
                print(f"[Stage 7] 無法為 {name} 建立 SHAP explainer：{e}")
                return

    try:
        explanation = explainer(X_explain)
    except Exception as e:
        print(f"[Stage 7] {name} 的 SHAP 計算失敗：{e}")
        return

    # 取得 shap values，並整理為二維陣列 [n_samples, n_features]
    values = getattr(explanation, 'values', None)
    if values is None:
        # Some shap versions return .shap_values
        values = getattr(explainer, 'shap_values', None)
        if callable(values):
            try:
                values = values(X_explain)
            except Exception:
                values = None
    # 多分類輸出處理
    if isinstance(values, list):
        # List of arrays per class: [n_samples, n_features]
        vals = [np.asarray(v) for v in values]
        # Aggregate by mean absolute across classes
        V = np.mean(np.abs(np.stack(vals, axis=0)), axis=0)
    else:
        V = np.asarray(values)
        if V.ndim == 3:
            # [n_samples, n_features, n_outputs] -> aggregate outputs
            V = np.mean(np.abs(V), axis=2)
        # else assume [n_samples, n_features]

    # 輸出特徵重要度（mean |shap|）
    mean_abs = np.mean(np.abs(V), axis=0)
    imp_df = pd.DataFrame({
        'feature': feature_names,
        'mean_abs_shap': mean_abs,
        'model': name,
    }).sort_values('mean_abs_shap', ascending=False)
    out_csv = out_dir / f'stage7_shap_importance_{name.replace(" ", "_")}.csv'
    try:
        imp_df.to_csv(out_csv, index=False, encoding='utf-8-sig')
    except Exception:
        imp_df.to_csv(out_csv, index=False)

    # Save per-sample SHAP values for downstream cluster-wise analysis
    try:
        ids_explain = ids[idx_explain] if ids is not None else np.arange(len(X_explain))
        shap_cols = {f'shap_{fn}': V[:, j] for j, fn in enumerate(feature_names)}
        shap_df = pd.DataFrame({'CustomerID': ids_explain, 'model': name, **shap_cols})
        out_sv = out_dir / f'stage7_shap_values_{name.replace(" ", "_")}.csv'
        shap_df.to_csv(out_sv, index=False, encoding='utf-8-sig')
    except Exception as e:
        print(f"[Stage 7] 無法輸出逐樣本 SHAP 值（{name}）：{e}")

    # 輸出 SHAP 摘要圖（bar 與 dot）
    X_df = pd.DataFrame(X_explain, columns=feature_names)
    try:
        shap.summary_plot(V, X_df, plot_type='bar', show=False)
        plt.tight_layout()
        plt.savefig(out_dir / f'stage7_shap_summary_bar_{name.replace(" ", "_")}.png', dpi=150)
        plt.close()

        shap.summary_plot(V, X_df, show=False)
        plt.tight_layout()
        plt.savefig(out_dir / f'stage7_shap_summary_{name.replace(" ", "_")}.png', dpi=150)
        plt.close()
    except Exception as e:
        print(f"[Stage 7] 繪圖失敗（{name}）：{e}")

    print(f"[Stage 7] 已儲存 {name} 的 SHAP 重要度與圖表")


def main():
    if not _ensure_shap():
        return

    # 準備特徵
    try:
        X, feat_cols, ids = _rebuild_test_features()
    except Exception as e:
        print(f"[Stage 7] 重建測試特徵失敗：{e}")
        return

    # 嘗試載入 Stage 6 的 kmeans 以取得 y_true（可選）。
    # ただし保存済み scaler が現在の特徴次元と不一致ならフォールバックして None にする。
    y_true = None

    def _try_kmeans_y(mat):
        try:
            scaler = _load_obj('scaler.pkl')
            kmeans_clients = _load_obj('kmeans_clients.pkl')
            # scaler の期待次元を持っているならチェックする
            if hasattr(scaler, 'n_features_in_') and scaler.n_features_in_ != mat.shape[1]:
                return None
            scaled = scaler.transform(mat)
            return kmeans_clients.predict(scaled)
        except Exception:
            return None

    try:
        set_test = pd.read_csv(SET_TEST_PATH)
        list_cols = ['count','min','max','mean','categ_0','categ_1','categ_2','categ_3','categ_4']
        matrix_test = set_test.groupby(by=['CustomerID'])['Basket Price'].agg(
            ['count', 'min', 'max', 'mean', 'sum']
        )
        for i in range(5):
            col = f'categ_{i}'
            matrix_test.loc[:, col] = (
                set_test.groupby(by=['CustomerID'])[col].sum() / matrix_test['sum'] * 100
            )
        matrix_test['count'] = 5 * matrix_test['count']
        matrix_test['sum'] = matrix_test['count'] * matrix_test['mean']
        matrix_test = matrix_test[list_cols].values
        y_true = _try_kmeans_y(matrix_test)
    except Exception:
        # 何か問題あれば y_true は None のまま（後続は推定できるモデルがあれば継続）
        y_true = None

    # 載入已訓練模型（優先選擇解釋較快者）
    models = []
    try:
        models.append(('Random_Forest', _load_obj('rf_best.pkl')))
    except Exception:
        pass
    try:
        models.append(('Gradient_Boosting', _load_obj('gb_best.pkl')))
    except Exception:
        pass
    # 線性／羅吉斯（LinearExplainer）
    try:
        models.append(('Logistic_Regression', _load_obj('lr_best.pkl')))
    except Exception:
        pass
    # Voting 可能較耗時；視需要包含
    try:
        models.append(('Voting_RF_GB_KNN', _load_obj('votingC.pkl')))
    except Exception:
        pass

    if not models:
        print("[Stage 7] 找不到可解釋的模型，請先完成 Stage 5。")
        return

    out_dir = ARTIFACTS
    summary = {}
    for name, model in models:
        _compute_shap_for_model(name, model, X, feat_cols, out_dir, ids=ids)
        # 若取得 y_true，則記錄參考準確率
        try:
            if y_true is not None:
                import sklearn.metrics as skm
                pred = model.predict(X)
                summary[name] = float(skm.accuracy_score(y_true, pred))
        except Exception:
            pass

    if summary:
        with open(out_dir / 'stage7_reference_acc.json', 'w', encoding='utf-8') as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)
        print('[Stage 7] 已輸出 stage7_reference_acc.json（參考準確率）。')

    print('[Stage 7] 完成。輸出已儲存至 artifacts/:')
    print(' - stage7_shap_importance_<MODEL>.csv')
    print(' - stage7_shap_summary_bar_<MODEL>.png')
    print(' - stage7_shap_summary_<MODEL>.png')



if __name__ == '__main__':
    main()
