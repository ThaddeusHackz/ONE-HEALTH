# =============================================================================
# ONE HEALTH GHANA - Companion notebook (Phase 2, modified)
# Country default: Ghana. Bugs from code.txt are fixed here.
# Run cell-by-cell in Google Colab or locally.
# =============================================================================

# !pip install pandas numpy matplotlib seaborn scikit-learn statsmodels -q

from __future__ import annotations

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.model_selection import TimeSeriesSplit
from statsmodels.tsa.seasonal import seasonal_decompose
from statsmodels.tsa.stattools import adfuller
from statsmodels.graphics.tsaplots import plot_acf, plot_pacf
from statsmodels.tsa.statespace.sarimax import SARIMAX

sns.set_style("whitegrid")
COUNTRY = "Ghana"
print("Environment ready. Country:", COUNTRY)

# -----------------------------------------------------------------------------
# MODULE 4 - Ingest (Ghana)
# -----------------------------------------------------------------------------
url = "https://covid.ourworldindata.org/data/owid-covid-data.csv"
df = pd.read_csv(url, usecols=["location", "date", "new_cases", "new_deaths", "population"])
df["date"] = pd.to_datetime(df["date"])
df = df[df["location"] == COUNTRY].sort_values("date").reset_index(drop=True)
print(df.shape)
print(df.isna().sum())
print("duplicate dates", int(df.duplicated(subset="date").sum()))

# -----------------------------------------------------------------------------
# MODULE 5 - Clean
# -----------------------------------------------------------------------------
df["new_cases"] = df["new_cases"].clip(lower=0)
weekly = (
    df.set_index("date")[["new_cases"]]
    .resample("W")
    .sum()
    .reset_index()
    .rename(columns={"new_cases": "weekly_cases"})
)
weekly["weekly_cases"] = weekly["weekly_cases"].interpolate(method="linear", limit=2, limit_area="inside")
weekly["is_imputed_gap"] = weekly["weekly_cases"].isna()
print(weekly.head())

# -----------------------------------------------------------------------------
# MODULE 6 - EDA
# -----------------------------------------------------------------------------
fig, ax = plt.subplots(figsize=(12, 5))
ax.plot(weekly["date"], weekly["weekly_cases"], label="Weekly cases", alpha=0.6)
ax.plot(weekly["date"], weekly["weekly_cases"].rolling(4).mean(), label="4-week rolling mean", color="black")
ax.set_title(f"Weekly reported COVID-19 cases - {COUNTRY}")
ax.legend()
plt.show()

# -----------------------------------------------------------------------------
# MODULE 7 - Diagnostics
# -----------------------------------------------------------------------------
series = weekly.set_index("date")["weekly_cases"].dropna()
if len(series) >= 104:
    seasonal_decompose(series, model="additive", period=52).plot()
    plt.show()
adf = adfuller(series)
print(f"ADF={adf[0]:.3f} p={adf[1]:.3f}")
fig, axes = plt.subplots(1, 2, figsize=(14, 4))
plot_acf(series, lags=min(52, len(series) // 2 - 1), ax=axes[0])
plot_pacf(series, lags=min(20, len(series) // 2 - 1), ax=axes[1])
plt.show()

# -----------------------------------------------------------------------------
# MODULE 8 - Baselines (shifted: no leakage)
# -----------------------------------------------------------------------------
s = weekly["weekly_cases"]
baseline_df = pd.DataFrame({
    "date": weekly["date"],
    "actual": s,
    "naive": s.shift(1),
    "seasonal_naive": s.shift(52),
    "moving_avg": s.rolling(4).mean().shift(1),
})

# -----------------------------------------------------------------------------
# MODULE 9 - Chronological split
# -----------------------------------------------------------------------------
train_end, test_start = "2022-01-01", "2023-01-01"
print("TimeSeriesSplit folds:")
for fold, (tr, te) in enumerate(TimeSeriesSplit(n_splits=5).split(weekly)):
    print(fold, len(tr), len(te))

# -----------------------------------------------------------------------------
# MODULE 10 - Features AFTER shift, BEFORE split
# -----------------------------------------------------------------------------
fe = weekly.copy()
for lag in (1, 2, 3, 4):
    fe[f"lag_{lag}"] = fe["weekly_cases"].shift(lag)
fe["rolling_mean_4"] = fe["weekly_cases"].shift(1).rolling(4).mean()
fe["rolling_std_4"] = fe["weekly_cases"].shift(1).rolling(4).std()
fe["week_of_year"] = fe["date"].dt.isocalendar().week.astype(int)
fe["month"] = fe["date"].dt.month
fe = fe.dropna().reset_index(drop=True)

feature_cols = [
    "lag_1", "lag_2", "lag_3", "lag_4",
    "rolling_mean_4", "rolling_std_4", "week_of_year", "month",
]
train_fe = fe[fe["date"] < train_end].copy()
val_fe = fe[(fe["date"] >= train_end) & (fe["date"] < test_start)].copy()
test_fe = fe[fe["date"] >= test_start].copy()
X_train, y_train = train_fe[feature_cols], train_fe["weekly_cases"]
X_test, y_test = test_fe[feature_cols], test_fe["weekly_cases"]

# -----------------------------------------------------------------------------
# MODULE 12 - Models (RF on train only; SARIMA on train only)
# -----------------------------------------------------------------------------
rf = RandomForestRegressor(n_estimators=300, random_state=42)
rf.fit(X_train, y_train)
rf_preds = rf.predict(X_test)

sarima_train = weekly.loc[weekly["date"] < test_start, "weekly_cases"]
sarima = SARIMAX(
    sarima_train,
    order=(1, 1, 1),
    seasonal_order=(1, 1, 1, 52),
    enforce_stationarity=False,
    enforce_invertibility=False,
)
sarima_fit = sarima.fit(disp=False)
sarima_fc = sarima_fit.get_forecast(steps=len(test_fe))
sarima_preds = pd.Series(sarima_fc.predicted_mean.values, index=test_fe.index)
sarima_ci = sarima_fc.conf_int()

# -----------------------------------------------------------------------------
# MODULE 13 - Evaluation (aligned on dates)
# -----------------------------------------------------------------------------

def evaluate(y_true, y_pred, label: str) -> None:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    n = min(len(y_true), len(y_pred))
    y_true, y_pred = y_true[:n], y_pred[:n]
    mae = mean_absolute_error(y_true, y_pred)
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    smape = 100 * np.mean(2 * np.abs(y_pred - y_true) / (np.abs(y_true) + np.abs(y_pred) + 1e-9))
    print(f"{label:22s} MAE={mae:8.1f} RMSE={rmse:8.1f} sMAPE={smape:6.2f}%")


base_test = baseline_df[baseline_df["date"].isin(test_fe["date"])]
evaluate(y_test, base_test["naive"], "Naive")
evaluate(y_test, base_test["moving_avg"], "Moving average")
evaluate(y_test, rf_preds, "Random forest")
evaluate(y_test, sarima_preds, "SARIMA (train only)")

# -----------------------------------------------------------------------------
# MODULE 14 - Intervals
# -----------------------------------------------------------------------------
tree_preds = np.stack([t.predict(X_test) for t in rf.estimators_])
lower, upper = np.percentile(tree_preds, 5, axis=0), np.percentile(tree_preds, 95, axis=0)
plt.figure(figsize=(10, 5))
plt.plot(test_fe["date"], y_test.values, label="Actual", color="black")
plt.plot(test_fe["date"], rf_preds, label="RF", color="red")
plt.fill_between(test_fe["date"], lower, upper, color="red", alpha=0.2, label="90% tree interval")
plt.title(f"{COUNTRY} - RF with interval (not certainty)")
plt.legend()
plt.show()

# -----------------------------------------------------------------------------
# MODULE 15 - Early warning (fixed print + ffill)
# -----------------------------------------------------------------------------
train = weekly[weekly["date"] < train_end].copy()
weekly_analysis = weekly.copy()
weekly_analysis["baseline_mean"] = train["weekly_cases"].rolling(8).mean()
weekly_analysis["baseline_std"] = train["weekly_cases"].rolling(8).std()
weekly_analysis[["baseline_mean", "baseline_std"]] = weekly_analysis[["baseline_mean", "baseline_std"]].ffill()
weekly_analysis["z_score"] = (
    (weekly_analysis["weekly_cases"] - weekly_analysis["baseline_mean"])
    / weekly_analysis["baseline_std"].replace(0, np.nan)
)
weekly_analysis["alert"] = weekly_analysis["z_score"] > 2
alerts_triggered = weekly_analysis[(weekly_analysis["date"] >= test_start) & (weekly_analysis["alert"])]
print(f"Alerts ({len(alerts_triggered)}) - investigation prompts, not confirmed outbreaks")
print(alerts_triggered[["date", "weekly_cases", "z_score"]].head())

# -----------------------------------------------------------------------------
# MODULE 16 - Importance ≠ causation
# -----------------------------------------------------------------------------
print(pd.Series(rf.feature_importances_, index=feature_cols).sort_values(ascending=False))
print("lag_1 dominance means last week predicts this week statistically. It is not a causal proof.")
