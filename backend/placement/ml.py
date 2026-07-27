"""
Placement-readiness predictor powered by Scikit-Learn.

Supported ML algorithms:
  - RandomForestClassifier (Default)
  - DecisionTreeClassifier
  - KNeighborsClassifier
  - LinearRegression

Trained on synthetic-but-realistic academic profiles to map a student's
record (CPI, attendance, backlogs, extra activities) to a placement probability.
"""
import threading
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.neighbors import KNeighborsClassifier
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline

_MODEL = None
_MODEL_TYPE = 'random_forest'  # Supported: 'random_forest', 'decision_tree', 'knn', 'linear_regression'
_LOCK = threading.Lock()

FEATURE_NAMES = ['cpi', 'attendance', 'backlogs', 'extra']


def _sigmoid(z):
    return 1.0 / (1.0 + np.exp(-np.clip(z, -30, 30)))


def _synthesize(n=4000, seed=42):
    """Generate a labelled training set from a plausible placement process."""
    rng = np.random.default_rng(seed)
    cpi = rng.uniform(4.0, 10.0, n)
    attendance = rng.uniform(40.0, 100.0, n)
    backlogs = rng.poisson(1.0, n).clip(0, 8).astype(float)
    extra = rng.integers(0, 4, n).astype(float)  # count of activities 0-3

    z = (1.25 * (cpi - 6.7)
         + 0.045 * (attendance - 72.0)
         - 0.95 * backlogs
         + 0.35 * extra)
    prob = _sigmoid(z)
    y = (prob > rng.uniform(0, 1, n)).astype(float)
    X = np.column_stack([cpi, attendance, backlogs, extra])
    return X, y


def build_model(model_type='random_forest'):
    """Factory to train and return one of the 4 requested scikit-learn models."""
    X, y = _synthesize()
    
    if model_type == 'decision_tree':
        model = DecisionTreeClassifier(max_depth=6, min_samples_split=10, random_state=42)
    elif model_type == 'knn':
        model = make_pipeline(StandardScaler(), KNeighborsClassifier(n_neighbors=15))
    elif model_type == 'linear_regression':
        model = make_pipeline(StandardScaler(), LinearRegression())
    else:  # 'random_forest'
        model = RandomForestClassifier(n_estimators=100, max_depth=8, random_state=42)

    model.fit(X, y)
    return model


def get_model(model_type=None):
    global _MODEL, _MODEL_TYPE
    target_type = model_type or _MODEL_TYPE
    if target_type != _MODEL_TYPE or _MODEL is None:
        with _LOCK:
            if target_type != _MODEL_TYPE or _MODEL is None:
                _MODEL_TYPE = target_type
                _MODEL = build_model(_MODEL_TYPE)
    return _MODEL


def predict_probability(cpi, attendance, backlogs, extra_count, model_type=None):
    model = get_model(model_type)
    x = np.array([[cpi, attendance, backlogs, extra_count]])
    
    if hasattr(model, 'predict_proba'):
        prob = model.predict_proba(x)[0][1]
    else:
        # For LinearRegression output continuous prediction
        pred = model.predict(x)[0]
        prob = float(np.clip(pred, 0.0, 1.0))
        
    return float(np.clip(prob, 0.0, 1.0))



