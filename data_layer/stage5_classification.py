# =============================
# Stage 5 — classification.py
# Goal: Train all classifiers on training set; save best estimators + ensemble
# =============================

import warnings, json
from pathlib import Path

import numpy as np
import pandas as pd
import joblib

from sklearn import neighbors, linear_model, svm, tree, ensemble, metrics
from sklearn.model_selection import GridSearchCV, train_test_split
from sklearn.ensemble import AdaBoostClassifier, VotingClassifier

warnings.filterwarnings("ignore")

DATA_LAYER_DIR = Path(__file__).resolve().parent
ARTIFACTS = DATA_LAYER_DIR / "artifacts"
ARTIFACTS.mkdir(parents=True, exist_ok=True)
OBJECTS = ARTIFACTS / "objects"
OBJECTS.mkdir(parents=True, exist_ok=True)

# ---- Load features/labels from Stage 4 ----
selected_customers = pd.read_csv(ARTIFACTS / "stage4_selected_customers_train.csv")
columns = ['mean', 'categ_0', 'categ_1', 'categ_2', 'categ_3', 'categ_4' ]
X = selected_customers[columns]
Y = selected_customers['cluster']

# ---- Split（補上 stratify + 固定種子）----aa
X_train, X_test, Y_train, Y_test = train_test_split(
    X, Y, train_size=0.8, random_state=42, stratify=Y
)
test_ids = selected_customers.loc[X_test.index, 'CustomerID'].values  # for exporting

# ---- Helper（沿用你的介面）----
class Class_Fit(object):
    def __init__(self, clf, params=None):
        if params:
            self.clf = clf(**params)
        else:
            self.clf = clf()

    def train(self, x_train, y_train):
        self.clf.fit(x_train, y_train)

    def predict(self, x):
        return self.clf.predict(x)

    def grid_search(self, parameters, Kfold):
    # 平行用滿所有 CPU，並顯示進度
        self.grid = GridSearchCV(
            estimator=self.clf,
            param_grid=parameters,
            cv=Kfold,
            n_jobs=-1,
            verbose=1
    )


    def grid_fit(self, X, Y):
        self.grid.fit(X, Y)

    def grid_predict(self, X, Y):
        self.predictions = self.grid.predict(X)
        acc = float(metrics.accuracy_score(Y, self.predictions))
        print("Precision: {:.2f} % ".format(100*acc))
        return acc

# ---- 安全取得機率（LinearSVC 轉 softmax；其他用 predict_proba）----
def _safe_predict_proba(est, X):
    if hasattr(est, "predict_proba"):
        return est.predict_proba(X)
    if hasattr(est, "decision_function"):
        scores = est.decision_function(X)
        if scores.ndim == 1:
            scores = np.vstack([-scores, scores]).T
        e = np.exp(scores - np.max(scores, axis=1, keepdims=True))
        return e / e.sum(axis=1, keepdims=True)
    # fallback：one-hot
    preds = est.predict(X)
    classes = getattr(est, "classes_", np.unique(preds))
    proba = np.zeros((len(preds), len(classes)))
    for i, c in enumerate(classes):
        proba[preds == c, i] = 1.0
    return proba

def proba_dataframe(model, X, model_name, class_labels, index_values, y_true=None, y_pred=None):
    proba = _safe_predict_proba(model, X)
    model_classes = getattr(model, "classes_", np.arange(proba.shape[1]))
    # 對齊到全域 class_labels
    dfp = pd.DataFrame(0.0, index=np.arange(len(X)),
                       columns=[f"p_{int(c)}" for c in class_labels])
    col_map = {int(c): j for j, c in enumerate(model_classes)}
    for c in class_labels:
        j = col_map.get(int(c), None)
        if j is not None:
            dfp[f"p_{int(c)}"] = proba[:, j]
    dfp.insert(0, "model", model_name)
    dfp.insert(1, "row_index", index_values)
    if y_true is not None:
        dfp.insert(2, "y_true", y_true)
    if y_pred is not None:
        dfp.insert(3, "y_pred", y_pred)
    return dfp

# ---- 1) SVC（補齊你評估用到 SVC 的訓練段）----
svc = Class_Fit(clf = svm.LinearSVC)
svc.grid_search(parameters = [{'C':np.logspace(-2,2,10)}], Kfold = 5)
svc.grid_fit(X_train, Y_train)

# ---- 2) 其他模型（與你一致）----
lr = Class_Fit(clf = linear_model.LogisticRegression)
lr.grid_search(parameters = [{'C':np.logspace(-2,2,20)}], Kfold = 5)
lr.grid_fit(X_train, Y_train)

knn = Class_Fit(clf = neighbors.KNeighborsClassifier)
knn.grid_search(parameters = [{'n_neighbors': np.arange(1,50,1)}], Kfold = 5)
knn.grid_fit(X_train, Y_train)

tr = Class_Fit(clf = tree.DecisionTreeClassifier)
tr.grid_search(parameters = [{'criterion' : ['entropy', 'gini'], 'max_features' :['sqrt', 'log2']}], Kfold = 5)
tr.grid_fit(X_train, Y_train)

rf = Class_Fit(clf = ensemble.RandomForestClassifier)
param_grid = {'criterion' : ['entropy', 'gini'], 'n_estimators' : [20, 40, 60, 80, 100], 'max_features' :['sqrt', 'log2']}
rf.grid_search(parameters = param_grid, Kfold = 5)
rf.grid_fit(X_train, Y_train)

ada = Class_Fit(clf = AdaBoostClassifier)
param_grid = {'n_estimators' : [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
ada.grid_search(parameters = param_grid, Kfold = 5)
ada.grid_fit(X_train, Y_train)

gb = Class_Fit(clf = ensemble.GradientBoostingClassifier)
param_grid = {'n_estimators' : [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
gb.grid_search(parameters = param_grid, Kfold = 5)
gb.grid_fit(X_train, Y_train)

# ---- Save best estimators（與你一致）----
joblib.dump(rf.grid.best_estimator_, ARTIFACTS/'rf_best.pkl')
joblib.dump(gb.grid.best_estimator_, ARTIFACTS/'gb_best.pkl')
joblib.dump(knn.grid.best_estimator_, ARTIFACTS/'knn_best.pkl')
joblib.dump(svc.grid.best_estimator_, ARTIFACTS/'svc_best.pkl')
joblib.dump(tr.grid.best_estimator_, ARTIFACTS/'tr_best.pkl')
joblib.dump(lr.grid.best_estimator_, ARTIFACTS/'lr_best.pkl')
try:
    joblib.dump(rf.grid.best_estimator_, OBJECTS/'rf_best.pkl')
    joblib.dump(gb.grid.best_estimator_, OBJECTS/'gb_best.pkl')
    joblib.dump(knn.grid.best_estimator_, OBJECTS/'knn_best.pkl')
    joblib.dump(svc.grid.best_estimator_, OBJECTS/'svc_best.pkl')
    joblib.dump(tr.grid.best_estimator_, OBJECTS/'tr_best.pkl')
    joblib.dump(lr.grid.best_estimator_, OBJECTS/'lr_best.pkl')
    # Remove duplicates from artifacts root if present
    for _name in ['rf_best.pkl','gb_best.pkl','knn_best.pkl','svc_best.pkl','tr_best.pkl','lr_best.pkl']:
        _p = ARTIFACTS / _name
        try:
            if _p.exists():
                _p.unlink()
        except Exception:
            pass
except Exception as _e:
    print(f"[Stage 5] Warning: failed to save best estimators to artifacts/objects/: {_e}")

# ---- Voting classifier (rf+gb+knn, soft) ----
votingC = VotingClassifier(
    estimators=[('rf', rf.grid.best_estimator_),
                ('gb', gb.grid.best_estimator_),
                ('knn', knn.grid.best_estimator_)],
    voting='soft'
)
votingC.fit(X_train, Y_train)
joblib.dump(votingC, ARTIFACTS/'votingC.pkl')
try:
    joblib.dump(votingC, OBJECTS/'votingC.pkl')
    # Remove duplicate from artifacts root if present
    try:
        _p = ARTIFACTS/'votingC.pkl'
        if _p.exists():
            _p.unlink()
    except Exception:
        pass
except Exception as _e:
    print(f"[Stage 5] Warning: failed to save votingC to artifacts/objects/: {_e}")

# ---- Quick eval snapshot（accuracy 保留 0~1 浮點；與你一致）----
results = {}
models_for_eval = [
    ('SVC',  svc.grid.best_estimator_),
    ('LR',   lr.grid.best_estimator_),
    ('KNN',  knn.grid.best_estimator_),
    ('DT',   tr.grid.best_estimator_),
    ('RF',   rf.grid.best_estimator_),
    ('ADA',  ada.grid.best_estimator_),
    ('GB',   gb.grid.best_estimator_),
    ('VOTE', votingC),
]
for name, est in models_for_eval:
    pred = est.predict(X_test)
    results[name] = float(metrics.accuracy_score(Y_test, pred))

with open(ARTIFACTS/'stage5_eval.json','w', encoding='utf-8') as f:
    json.dump(results, f, indent=2, ensure_ascii=False)

print('[Stage 5] Saved best estimators + votingC to artifacts/. Accuracies:', results)

# ---- 機率輸出（每個模型都輸出，且「含模型名稱」）----
class_labels = np.sort(Y.unique())
proba_frames = []
for name, est in models_for_eval:
    y_pred = est.predict(X_test)
    dfp = proba_dataframe(
        est, X_test, model_name=name,
        class_labels=class_labels,
        index_values=test_ids,  # 這裡放 CustomerID；也可改成 X_test.index
        y_true=Y_test.values,
        y_pred=y_pred
    )
    proba_frames.append(dfp)

proba_out = pd.concat(proba_frames, axis=0, ignore_index=True)
proba_out.to_csv(ARTIFACTS/'stage5_pred_proba.csv', index=False)
print('[Stage 5] Saved per-sample probabilities to artifacts/stage5_pred_proba.csv')


try:
    # X_train は numpy 配列なので、カラム名を付けて DataFrame に戻す
    X_train_df = pd.DataFrame(X_train, columns=columns) 
    X_train_df.to_csv(ARTIFACTS / "stage5_X_train_for_shap.csv", index=False)
    print('[Stage 5] Saved X_train for SHAP background.')
except Exception as e:
    print(f'[Stage 5] Warning: Failed to save X_train for SHAP: {e}')