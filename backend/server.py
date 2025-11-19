import os
import sys
import json
import pandas as pd
import numpy as np
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

BACKEND_DIR = Path(__file__).resolve().parent
REPO_ROOT = BACKEND_DIR.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.append(str(REPO_ROOT))

from data_layer.pipeline import run_all_stages
import threading

app = FastAPI(title="Upload Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_LAYER_DIR = BASE_DIR / "data_layer"
UPLOADS_DIR = DATA_LAYER_DIR / "uploads"
ARTIFACTS_DIR = DATA_LAYER_DIR / "artifacts"
TARGET_FILENAME = "data.csv"
CHUNK_SIZE = 4 * 1024 * 1024
DEFAULT_MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "100"))
MAX_UPLOAD_BYTES = DEFAULT_MAX_UPLOAD_MB * 1024 * 1024

app.mount("/artifacts", StaticFiles(directory=ARTIFACTS_DIR), name="artifacts")

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    # (ここは変更なしですが、文脈のために省略せず記載します)
    if file is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="未收到檔案")

    try:
        UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise HTTPException(status_code=500, detail="建立 uploads 資料夾失敗") from exc

    destination = UPLOADS_DIR / TARGET_FILENAME

    try:
        bytes_written = 0
        with destination.open("wb") as buffer:
            while True:
                chunk = await file.read(CHUNK_SIZE)
                if not chunk:
                    break
                bytes_written += len(chunk)
                if bytes_written > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail=f"檔案超過 {DEFAULT_MAX_UPLOAD_MB}MB 限制")
                buffer.write(chunk)
    except Exception as exc:
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="寫入檔案失敗") from exc
    
    # After saving the uploaded CSV, compute preview periods from the uploaded file
    preview_periods = []
    try:
        import pandas as _pd
        if destination.exists():
            df_upload = _pd.read_csv(destination, usecols=[c for c in _pd.read_csv(destination, nrows=0).columns if c.lower() in ["invoicedate", "invoice_date", "invoice date"]] if True else None)
            # fallback: try InvoiceDate present
            if df_upload is None or df_upload.shape[1] == 0:
                df_upload = _pd.read_csv(destination)
            if "InvoiceDate" in df_upload.columns or "InvoiceDate" in [c for c in df_upload.columns]:
                if "InvoiceDate" not in df_upload.columns:
                    # try to find a column case-insensitively
                    for c in df_upload.columns:
                        if c.lower() == "invoicedate":
                            df_upload.rename(columns={c: "InvoiceDate"}, inplace=True)
                            break
                df_upload["InvoiceDate"] = _pd.to_datetime(df_upload["InvoiceDate"], errors='coerce')
                if not df_upload["InvoiceDate"].isna().all():
                    df_upload["_period"] = df_upload["InvoiceDate"].dt.to_period('M').astype(str)
                    preview_periods = sorted(df_upload["_period"].dropna().unique().tolist(), reverse=True)
    except Exception as e:
        print(f"Warning: failed to compute preview periods from uploaded file: {e}")

    # Start the heavy pipeline in background thread so upload can return quickly
    def _run_pipeline_background():
        try:
            run_all_stages(stop_on_error=False)
        except Exception as exc:
            print(f"Background pipeline failed: {exc}")

    threading.Thread(target=_run_pipeline_background, daemon=True).start()

    return {
        "message": "上傳成功",
        "saved_as": TARGET_FILENAME,
        "preview_periods": preview_periods,
        "pipeline_started": True,
    }
# ... (冒頭のimportなどはそのまま) ...

# 趨勢計算用輔助函數
def calculate_trend(current, previous):
    if previous == 0:
        return 0.0
    return round(((current - previous) / previous) * 100, 1)


# 安全に整数へ変換するユーティリティ
def _to_int_safe(val, default=0):
    try:
        return int(val)
    except Exception:
        try:
            return int(float(val))
        except Exception:
            return default

# --- Overview (Page 1 & 2) 集計 ---
def analyze_overview(period: str | None = None):
    """Compute overview KPIs. If period provided (format 'YYYY-MM' or 'YYYY'), filter InvoiceDate to that period.
    Also compute month-over-month or year-over-year trends by comparing with previous period."""
    csv_path = ARTIFACTS_DIR / "stage2_df_cleaned.csv"
    if not csv_path.exists(): return None
    
    try:
        df = pd.read_csv(csv_path)
        if "InvoiceDate" in df.columns:
            df["InvoiceDate"] = pd.to_datetime(df["InvoiceDate"])
        # build available periods (monthly) for frontend selector
        df["_period"] = df["InvoiceDate"].dt.to_period('M').astype(str)
        periods = sorted(df["_period"].unique().tolist(), reverse=True)
        
        # Prepare data for current and previous period
        df_cur = df  # default: full dataset
        df_prev = None
        
        if period:
            # Filter to requested period
            if len(period) == 4:  # year only (YYYY)
                df_cur = df[df["InvoiceDate"].dt.year.astype(str) == period]
                # Previous year for comparison
                prev_year = str(int(period) - 1)
                df_prev = df[df["InvoiceDate"].dt.year.astype(str) == prev_year]
            else:  # month (YYYY-MM)
                df_cur = df[df["_period"] == period]
                # Previous month for comparison
                try:
                    current = pd.Period(period, freq='M')
                    prev = current - 1
                    prev_period_str = str(prev)
                    df_prev = df[df["_period"] == prev_period_str]
                except Exception:
                    df_prev = None
        else:
            # No period specified: use last 30 days vs previous 30 days (for trends)
            last_date = df["InvoiceDate"].max()
            cutoff_current = last_date - pd.Timedelta(days=30)
            cutoff_previous = cutoff_current - pd.Timedelta(days=30)
            df_cur = df[df["InvoiceDate"] > cutoff_current]
            df_prev = df[(df["InvoiceDate"] <= cutoff_current) & (df["InvoiceDate"] > cutoff_previous)]
        
        last_date = df["InvoiceDate"].max()
        
        # 1. KPI計算 (current vs previous)
        sales_cur = int(df_cur["TotalPrice"].sum())
        sales_prev = int(df_prev["TotalPrice"].sum()) if df_prev is not None and len(df_prev) > 0 else 0
        
        orders_cur = int(df_cur["InvoiceNo"].nunique())
        orders_prev = int(df_prev["InvoiceNo"].nunique()) if df_prev is not None and len(df_prev) > 0 else 0

        members_cur = int(df_cur["CustomerID"].nunique())
        members_prev = int(df_prev["CustomerID"].nunique()) if df_prev is not None and len(df_prev) > 0 else 0

        # 平均消費額
        avg_spend_cur = int(sales_cur / members_cur) if members_cur else 0
        avg_spend_prev = int(sales_prev / members_prev) if members_prev and members_prev > 0 else 0

        # 活躍率（整體會員中，有購買者所占比例）
        total_members_all_time = df["CustomerID"].nunique()
        engagement_rate = round((members_cur / total_members_all_time) * 100, 1) if total_members_all_time else 0
        
        # 前期の活躍率
        engagement_prev = round((members_prev / total_members_all_time) * 100, 1) if members_prev and total_members_all_time else 0

        # 2. 地區分布 (Country) - 全期間匯總
        country_counts = df_cur["Country"].value_counts(normalize=True) * 100
        regions = []
        colors = ["#60a5fa", "#34d399", "#f59e0b", "#ef4444", "#a855f7"]
        for i, (country, pct) in enumerate(country_counts.head(4).items()):
            regions.append({"name": country, "pct": round(float(pct), 1), "color": colors[i % len(colors)]})
        
        # ★Premium Membersの計算
        df_lifetime = df_cur.groupby('CustomerID')['TotalPrice'].sum().sort_values(ascending=False)
        # 上位20%の顧客を抽出
        top_20_percent = int(members_cur * 0.2) if members_cur > 0 else 0
        premium_members = int(df_lifetime.head(top_20_percent).count()) if top_20_percent > 0 else 0
        
        # Premium Members（前期比較）
        if df_prev is not None and len(df_prev) > 0:
            df_lifetime_prev = df_prev.groupby('CustomerID')['TotalPrice'].sum().sort_values(ascending=False)
            top_20_percent_prev = int(members_prev * 0.2) if members_prev > 0 else 0
            premium_members_prev = int(df_lifetime_prev.head(top_20_percent_prev).count()) if top_20_percent_prev > 0 else 0
        else:
            premium_members_prev = 0

        # 3. 時系列チャート (current period)
        daily = df_cur.groupby(df_cur["InvoiceDate"].dt.date)["TotalPrice"].sum().reset_index()
        days_data = [{"day": str(row.InvoiceDate), "value": int(row.TotalPrice)} for _, row in daily.iterrows()]

        return {
            "kpis": {
                "totalSales": sales_cur,
                "salesTrend": calculate_trend(sales_cur, sales_prev),
                "totalOrders": orders_cur,
                "ordersTrend": calculate_trend(orders_cur, orders_prev),
                "totalMembers": members_cur,
                "membersTrend": calculate_trend(members_cur, members_prev),
                "averageSpend": avg_spend_cur,
                "averageTrend": calculate_trend(avg_spend_cur, avg_spend_prev),
                "engagement": engagement_rate,
                "engagementTrend": calculate_trend(engagement_rate, engagement_prev),
                "premiumMembers": premium_members,
                "premiumTrend": calculate_trend(premium_members, premium_members_prev)
            },
            "regions": regions,
            "chart": days_data,
            "lastDate": str(last_date),
            "available_periods": periods
        }
    except Exception as e:
        print(f"Error analyzing overview: {e}")
        return None

# 顧客分群命名對照（RFM分析に基づく業界標準セグメント）
SEGMENT_NAMES = {
    0: "Champions",              # 最高価値顧客 (R=4, F/M=4)
    1: "Loyal Customers",        # 忠実顧客 (R≥3, F≥3)
    2: "At Risk",                # リスク層 (R=1, F/M≥3)
    3: "Lost",                   # 離脱顧客 (R=1, F≤2, M≤2)
    4: "Need Attention",         # 要注視 (R=2, F/M≥3)
    5: "Promising",              # 有望層 (R≥3, F/M=1)
    6: "Big Spenders",           # 高額購買者 (M≥4)
    7: "Standard",               # 標準層 (その他)
}

# --- Stage 4 集計 (リピート日数とSilhouetteの読み込みロジックを整理) ---
def analyze_stage4_segments(period: str | None = None):
    import json # JSONを扱うために関数内でimport
    
    csv_path = ARTIFACTS_DIR / "stage4_selected_customers_train.csv"
    trans_path = ARTIFACTS_DIR / "stage2_df_cleaned.csv"
    
    if not csv_path.exists():
        return None     

    df = pd.read_csv(csv_path)
    # If period filter provided, reduce to customers active in that period
    if period:
        try:
            if trans_path.exists():
                df_trans = pd.read_csv(trans_path)
                df_trans["InvoiceDate"] = pd.to_datetime(df_trans["InvoiceDate"])
                df_trans["_period"] = df_trans["InvoiceDate"].dt.to_period('M').astype(str)
                if len(period) == 4:
                    active_cust = df_trans[df_trans["InvoiceDate"].dt.year.astype(str) == period]["CustomerID"].unique()
                else:
                    active_cust = df_trans[df_trans["_period"] == period]["CustomerID"].unique()
                df = df[df["CustomerID"].isin(active_cust)]
        except Exception:
            pass
    total_customers = len(df)
    if total_customers == 0:
        return None

    # 1. リピート日数の計算
    repeat_days = 0
    if trans_path.exists():
        try:
            df_trans = pd.read_csv(trans_path)
            df_trans["InvoiceDate"] = pd.to_datetime(df_trans["InvoiceDate"])
            # 顧客ごとに「最初の購入」と「最後の購入」の差分をとり、購入回数-1 で割る
            user_dates = df_trans.groupby("CustomerID")["InvoiceDate"].agg(["min", "max", "count"])
            user_dates = user_dates[user_dates["count"] > 1] # リピーターのみ
            if not user_dates.empty:
                total_days = (user_dates["max"] - user_dates["min"]).dt.days
                avg_intervals = total_days / (user_dates["count"] - 1)
                repeat_days = int(avg_intervals.mean())
        except Exception as e:
            print(f"Warning: Failed to calculate repeat days: {e}")

    # 2. シルエットスコアをJSONから読み込む (Stage 4のJSON書き出しとセットで動作)
    sil_score = 0.20
    test_rows = 0
    metrics_path = ARTIFACTS_DIR / "stage4_metrics.json" # Stage 4で出力される想定
    if metrics_path.exists():
        try:
            with open(metrics_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                # Accept either 'silhouette' or older 'silhouette_score' keys
                sil_score = round(data.get("silhouette", data.get("silhouette_score", 0.20)), 3)
                test_rows = data.get("test_rows", 0)
        except Exception as e:
            print(f"Warning: Failed to load stage4_metrics.json: {e}")

    metrics = {
        "trainRows": total_customers,
        "avgBasket": int(df["mean"].mean()),
        "monthlyTxn": int(df["count"].sum()),
        "silhouette": sil_score,
        "testRows": test_rows,
        "repeatDays": repeat_days
    }
    
    # --- セグメントごとの集計とストーリー生成 ---
    segments = []
    grouped = df.groupby("cluster")
    
    # 事前計算されたグローバル平均値を取得
    avg_basket_global = metrics["avgBasket"]
    avg_freq_global = df["count"].mean()
    
    # Compute previous-period customer cluster counts for trend calculation
    prev_cluster_counts = {}
    try:
        if trans_path.exists():
            df_trans = pd.read_csv(trans_path)
            df_trans["InvoiceDate"] = pd.to_datetime(df_trans["InvoiceDate"])
            df_trans["_period"] = df_trans["InvoiceDate"].dt.to_period('M').astype(str)
            prev_customers = []
            if period:
                if len(period) == 4:
                    prev_period = str(int(period) - 1)
                    prev_customers = df_trans[df_trans["InvoiceDate"].dt.year.astype(str) == prev_period]["CustomerID"].unique()
                else:
                    try:
                        current = pd.Period(period, freq='M')
                        prev = current - 1
                        prev_customers = df_trans[df_trans["_period"] == str(prev)]["CustomerID"].unique()
                    except Exception:
                        prev_customers = []
            else:
                last_date = df_trans["InvoiceDate"].max()
                cutoff_current = last_date - pd.Timedelta(days=30)
                cutoff_previous = cutoff_current - pd.Timedelta(days=30)
                prev_customers = df_trans[(df_trans["InvoiceDate"] <= cutoff_current) & (df_trans["InvoiceDate"] > cutoff_previous)]["CustomerID"].unique()

            if len(prev_customers) > 0:
                prev_cluster_counts = df[df["CustomerID"].isin(prev_customers)].groupby("cluster").size().to_dict()
    except Exception:
        prev_cluster_counts = {}

    for cluster_id, group in grouped:
        count = len(group)
        share = round((count / total_customers) * 100, 1)
        avg_basket = int(group["mean"].mean())
        total_spend = round(group["sum"].mean(), 2)
        freq = round(group["count"].mean(), 1)
        
        # 集中購買カテゴリの特定
        cat_cols = [f"categ_{i}" for i in range(5)]
        cat_means = group[cat_cols].mean().fillna(0)
        top_cat_idx = int(cat_means.argmax())
        # use iloc for positional access to avoid FutureWarning
        try:
            top_cat_pct = round(float(cat_means.iloc[top_cat_idx]), 1)
        except Exception:
            top_cat_pct = round(float(cat_means.values[top_cat_idx]) if len(cat_means.values) > top_cat_idx else 0, 1)
        top_cat_name = f"Category {top_cat_idx}"
        
        # セグメント名を取得（定義済みマッピングから）
        segment_name = SEGMENT_NAMES.get(_to_int_safe(cluster_id), f"Cluster {cluster_id}")

        # ストーリー生成ロジック（詳細化）
        story = "一般顧客群"
        if freq > 50:  # 異常に高い頻度
            story = "終極忠誠顧客，幾乎每天購買。請列為最高優先處理。"
        elif freq > 15 and total_spend > 5000:  # VIP層
            story = "高價值顧客，定期大量購買。建議提供專屬客服。"
        elif freq > 10 and total_spend > 5000:  # VIP層
            story = "VIP 顧客，購買頻率高且消費金額大，適合納入專屬活動。"
        elif freq > 10:  # 高頻度層
            story = "高頻率回購者，定期購買，為維持與擴大重點對象。"
        elif total_spend > 5000 and freq < 5:  # 散発高単価層
            story = "偶發性但單次消費高，可能為大宗或企業客戶。"
        elif total_spend > 2000:  # 継続高単価層
            story = "持續性高額消費族群，穩定度高，適合建立長期合作關係。"
        elif avg_basket > avg_basket_global * 1.5:
            story = "客單價較高但購買頻率中等，為中堅顧客群。"
        elif freq < 2.5 and avg_basket < avg_basket_global * 0.7:
            story = "經濟型顧客，價格導向，適合大眾促銷。"
        else:
            story = "標準型顧客，購買行為均衡，佔整體多數。"

        color_palette = ["#2563eb", "#10b981", "#f59e0b", "#a855f7", "#ef4444", "#ec4899", "#14b8a6", "#8b5cf6", "#d97706", "#06b6d4", "#f43f5e"]
        segment_color = color_palette[_to_int_safe(cluster_id) % len(color_palette)]

        # compute trend vs previous period for this cluster
        prev_count = int(prev_cluster_counts.get(cluster_id, 0)) if prev_cluster_counts else 0
        trend_val = calculate_trend(count, prev_count)
        trend_label = f"+{trend_val}%" if trend_val >= 0 else f"{trend_val}%"

        segments.append({
            "name": segment_name,
            "clusterId": _to_int_safe(cluster_id),
            "share": share,
            "count": int(count),
            "avgBasket": avg_basket,
            "totalSpend": total_spend,
            "frequency": f"{freq:.1f}",
            "trend": trend_val,
            "trendLabel": trend_label,
            "story": story,
            "focusProducts": [f"{top_cat_name} ({top_cat_pct}%)"],
            "color": segment_color
        })
    
    segments.sort(key=lambda x: x["share"], reverse=True)
    return {"metrics": metrics, "segments": segments}


# --- Stage 3 集計 (修正版：価格と返品率を追加) ---
def analyze_stage3_products(period: str | None = None):
    map_path = ARTIFACTS_DIR / "stage3_desc_to_prod_cluster.csv"
    trans_path = ARTIFACTS_DIR / "stage2_df_cleaned.csv" # 取引データも必要
    
    if not map_path.exists():
        return None
    
    try:
        # 1. クラスタ定義読み込み
        df_map = pd.read_csv(map_path)
        if df_map.shape[1] >= 2:
            df_map.columns = ["Description", "ClusterID"]
        else:
            return None
        
        # クリーニング
        df_map = df_map[pd.to_numeric(df_map['ClusterID'], errors='coerce').notnull()]
        df_map['ClusterID'] = df_map['ClusterID'].astype(int)

        # 2. 取引データ読み込み（価格計算用）
        df_trans = pd.DataFrame()
        if trans_path.exists():
            df_trans = pd.read_csv(trans_path)
        
        # 商品ごとに平均単価と総返品数を計算しておく
        if not df_trans.empty:
            # apply period filter when provided
            if period:
                try:
                    df_trans["InvoiceDate"] = pd.to_datetime(df_trans["InvoiceDate"])
                    df_trans["_period"] = df_trans["InvoiceDate"].dt.to_period('M').astype(str)
                    if len(period) == 4:
                        df_trans = df_trans[df_trans["InvoiceDate"].dt.year.astype(str) == period]
                    else:
                        df_trans = df_trans[df_trans["_period"] == period]
                except Exception:
                    pass
            prod_stats = df_trans.groupby("Description").agg({
                "UnitPrice": "mean",
                "Quantity": "sum",
                "QuantityCanceled": "sum"
            }).reset_index()
            # マージ
            merged = pd.merge(df_map, prod_stats, on="Description", how="left")
        else:
            merged = df_map
            merged["UnitPrice"] = 0
            merged["Quantity"] = 0
            merged["QuantityCanceled"] = 0

        total_products = len(merged)
        clusters = []
        
        grouped = merged.groupby("ClusterID")
        for pid, group in grouped:
            share = round((len(group) / total_products) * 100, 1)
            top_keywords = group["Description"].astype(str).head(3).tolist()
            
            # 【ここが修正点】リアルな単価と返品率を計算
            avg_price = int(group["UnitPrice"].mean()) if not group["UnitPrice"].isnull().all() else 0
            
            total_q = group["Quantity"].sum()
            total_c = group["QuantityCanceled"].sum()
            return_rate = 0
            if (total_q + total_c) > 0:
                return_rate = round((total_c / (total_q + total_c)) * 100, 1)

            clusters.append({
                "id": _to_int_safe(pid),
                "name": f"Product Group {pid}",
                "share": share,
                "avgPrice": avg_price,       # 計算結果
                "keywords": top_keywords,
                "topSkus": len(group),
                "returnRate": return_rate    # 計算結果
            })
            
        return {"clusters": clusters}

    except Exception as e:
        print(f"Error reading stage3 csv: {e}")
        return None

@app.get("/report/latest")
def get_latest_report(period: str | None = None):
    try:
        overview = analyze_overview(period=period)
        stage3 = analyze_stage3_products(period=period)
        stage4 = analyze_stage4_segments(period=period)

        eval5 = None
        eval6 = None
        try:
            p5 = ARTIFACTS_DIR / "stage5_eval.json"
            if p5.exists():
                with open(p5, 'r', encoding='utf-8') as f:
                    eval5 = json.load(f)
        except Exception as e:
            print(f"Warning: failed to load stage5_eval.json: {e}")

        try:
            p6 = ARTIFACTS_DIR / "stage6_eval.json"
            if p6.exists():
                with open(p6, 'r', encoding='utf-8') as f:
                    eval6 = json.load(f)
        except Exception as e:
            print(f"Warning: failed to load stage6_eval.json: {e}")

        # SHAP画像の検索（複数のモデル出力に対応）
        shap_images = {
            "summary": None,
            "beeswarm": None,
            "models": {}
        }
        
        # 優先順位付きで検索（バー＆プロット）
        model_priority = [
            ("Random_Forest", "Random Forest"),
            ("Gradient_Boosting", "Gradient Boosting"),
            ("Voting_RF_GB_KNN", "Voting (RF+GB+KNN)"),
            ("Logistic_Regression", "Logistic Regression")
        ]
        
        # 1. サマリープロット（モデルごとに収集。summary/beeswarm は最初に見つかったものを採用）
        for file_key, model_name in model_priority:
            bar_file = f"stage7_shap_summary_bar_{file_key}.png"
            plot_file = f"stage7_shap_summary_{file_key}.png"
            bar_path = ARTIFACTS_DIR / bar_file
            plot_path = ARTIFACTS_DIR / plot_file

            # Record per-model assets when present
            has_bar = bar_path.exists()
            has_plot = plot_path.exists()
            if has_bar or has_plot:
                shap_images["models"][model_name] = {
                    "bar": f"/artifacts/{bar_file}" if has_bar else None,
                    "plot": f"/artifacts/{plot_file}" if has_plot else None,
                }

            # Set global summary/beeswarm if not already set (first available)
            if shap_images.get("summary") is None and has_bar:
                shap_images["summary"] = f"/artifacts/{bar_file}"
            if shap_images.get("beeswarm") is None and has_plot:
                shap_images["beeswarm"] = f"/artifacts/{plot_file}"

        # Load SHAP importance data from CSV files
        shap_importance = {}
        model_names_for_shap = ["Random Forest", "Gradient Boosting", "Logistic Regression", "Voting (RF+GB+KNN)"]
        file_keys = ["Random_Forest", "Gradient_Boosting", "Logistic_Regression", "Voting_RF_GB_KNN"]
        
        for model_name, file_key in zip(model_names_for_shap, file_keys):
            csv_path = ARTIFACTS_DIR / f"stage7_shap_importance_{file_key}.csv"
            if csv_path.exists():
                try:
                    df_shap = pd.read_csv(csv_path)
                    # Sort by mean_abs_shap descending
                    df_shap = df_shap.sort_values('mean_abs_shap', ascending=False)
                    shap_importance[model_name] = [
                        {"feature": str(row['feature']), "importance": float(row['mean_abs_shap'])}
                        for _, row in df_shap.iterrows()
                    ]
                except Exception as e:
                    print(f"Warning: Failed to load SHAP importance for {model_name}: {e}")
                    shap_importance[model_name] = []
        
        # Load SHAP values (per-sample data) from CSV files
        shap_values = {}
        for model_name, file_key in zip(model_names_for_shap, file_keys):
            csv_path = ARTIFACTS_DIR / f"stage7_shap_values_{file_key}.csv"
            if csv_path.exists():
                try:
                    df_vals = pd.read_csv(csv_path)
                    # Limit to first 100 samples for frontend display
                    df_vals = df_vals.head(100)
                    shap_values[model_name] = df_vals.to_dict(orient='records')
                except Exception as e:
                    print(f"Warning: Failed to load SHAP values for {model_name}: {e}")
                    shap_values[model_name] = []

        resp = {
            "status": "ok",
            "overview": overview if overview is not None else None,
            "stage3": stage3 if stage3 is not None else None,
            "stage4": stage4 if stage4 is not None else None,
            "evaluation": {"stage5": eval5, "stage6": eval6},
            "shap_images": shap_images,
            "shap_importance": shap_importance,
            "shap_values": shap_values,
        }
        # JSON レスポンスを UTF-8 で返却（日本語を正しく表示）
        return JSONResponse(content=resp, media_type="application/json; charset=utf-8")
    except Exception as e:
        print(f"Error generating report: {e}")
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")