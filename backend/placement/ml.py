"""
Placement-readiness predictor powered by scikit-learn.

This module trains, evaluates, persists and serves ML models that map a
student's academic profile (CPI, attendance %, active backlogs, extra
activities) to a placement-readiness probability and category.

Supported algorithms (selectable at train / predict time):
  - random_forest      → RandomForestClassifier   (default)
  - gradient_boost     → GradientBoostingClassifier
  - logistic           → LogisticRegression (scaled)
  - decision_tree      → DecisionTreeClassifier
  - knn                → KNeighborsClassifier (scaled)
  - linear_regression  → LinearRegression (scaled, continuous readiness)

The training set is generated from a plausible, well-separated placement
process (see ``_synthesize``). Trained models are cached in-process and
persisted to ``placement/models/<type>.joblib`` so the server does not retrain
on every restart. Per-student features are pulled from real PostgreSQL data by
``placement.service``.
"""
import os
import threading
from datetime import datetime, timezone as _tz

import numpy as np
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.neighbors import KNeighborsClassifier
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    confusion_matrix, roc_auc_score,
)

try:
    import joblib
    _HAS_JOBLIB = True
except Exception:  # pragma: no cover - joblib ships with scikit-learn
    _HAS_JOBLIB = False

# ──────────────────────────────────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────────────────────────────────
FEATURE_NAMES = ['cpi', 'attendance', 'backlogs', 'extra']
DEFAULT_MODEL = 'random_forest'
MODELS_DIR = os.path.join(os.path.dirname(__file__), 'models')

_MODEL = None
_MODEL_TYPE = DEFAULT_MODEL
_METRICS = None
_LOCK = threading.Lock()


def _now_iso():
    return datetime.now(_tz.utc).isoformat()


def _sigmoid(z):
    return 1.0 / (1.0 + np.exp(-np.clip(z, -30, 30)))


# ──────────────────────────────────────────────────────────────────────────
# Training data
# ──────────────────────────────────────────────────────────────────────────
def _synthesize(n=4000, seed=42):
    """Generate a labelled training set from a plausible placement process.

    The latent score is a weighted combination of the four features passed
    through a sigmoid; the binary label ('placed') is sampled from that
    probability so the classes are realistically separable but not trivial.
    """
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
    y = (prob > rng.uniform(0, 1, n)).astype(int)
    X = np.column_stack([cpi, attendance, backlogs, extra])
    return X, y


# ──────────────────────────────────────────────────────────────────────────
# Model factory
# ──────────────────────────────────────────────────────────────────────────
def _make_estimator(model_type):
    if model_type == 'decision_tree':
        return DecisionTreeClassifier(max_depth=6, min_samples_split=10, random_state=42)
    if model_type == 'gradient_boost':
        return GradientBoostingClassifier(n_estimators=120, max_depth=3, random_state=42)
    if model_type == 'logistic':
        return make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000))
    if model_type == 'knn':
        return make_pipeline(StandardScaler(), KNeighborsClassifier(n_neighbors=15))
    if model_type == 'linear_regression':
        return make_pipeline(StandardScaler(), LinearRegression())
    return RandomForestClassifier(n_estimators=150, max_depth=8, random_state=42)


SUPPORTED_MODELS = [
    'random_forest', 'gradient_boost', 'logistic',
    'decision_tree', 'knn', 'linear_regression',
]


def _feature_importances(model):
    """Best-effort feature importances / coefficients as a name→weight dict."""
    est = model
    if hasattr(model, 'steps'):          # pipeline → last estimator
        est = model.steps[-1][1]
    weights = None
    if hasattr(est, 'feature_importances_'):
        weights = np.asarray(est.feature_importances_, dtype=float)
    elif hasattr(est, 'coef_'):
        coef = np.asarray(est.coef_, dtype=float).ravel()
        weights = np.abs(coef)
    if weights is None or len(weights) != len(FEATURE_NAMES):
        return None
    total = float(weights.sum()) or 1.0
    return {name: round(float(w) / total, 4) for name, w in zip(FEATURE_NAMES, weights)}


# ──────────────────────────────────────────────────────────────────────────
# Train + evaluate
# ──────────────────────────────────────────────────────────────────────────
def train(model_type=DEFAULT_MODEL, persist=True):
    """Train a model and return ``(model, metrics)``.

    ``metrics`` is a JSON-serialisable dict with accuracy, precision, recall,
    F1, ROC-AUC (where available), a 5-fold cross-validation summary, the
    confusion matrix and feature importances.
    """
    if model_type not in SUPPORTED_MODELS:
        raise ValueError(f'Unknown model_type {model_type!r}. Choose from {SUPPORTED_MODELS}.')

    X, y = _synthesize()
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.25, random_state=42, stratify=y)

    model = _make_estimator(model_type)
    model.fit(X_tr, y_tr)

    is_regression = model_type == 'linear_regression'
    if is_regression:
        raw = model.predict(X_te)
        y_pred = (np.clip(raw, 0.0, 1.0) >= 0.5).astype(int)
    else:
        y_pred = model.predict(X_te).astype(int)

    metrics = {
        'model_type': model_type,
        'algorithm': type(model.steps[-1][1]).__name__ if hasattr(model, 'steps') else type(model).__name__,
        'trained_at': _now_iso(),
        'n_samples': int(len(X)),
        'n_train': int(len(X_tr)),
        'n_test': int(len(X_te)),
        'features': FEATURE_NAMES,
        'accuracy': round(float(accuracy_score(y_te, y_pred)), 4),
        'precision': round(float(precision_score(y_te, y_pred, zero_division=0)), 4),
        'recall': round(float(recall_score(y_te, y_pred, zero_division=0)), 4),
        'f1': round(float(f1_score(y_te, y_pred, zero_division=0)), 4),
        'confusion_matrix': confusion_matrix(y_te, y_pred).tolist(),
        'feature_importance': _feature_importances(model),
    }

    # ROC-AUC where the model can produce probabilities
    try:
        if hasattr(model, 'predict_proba'):
            proba = model.predict_proba(X_te)[:, 1]
            metrics['roc_auc'] = round(float(roc_auc_score(y_te, proba)), 4)
    except Exception:
        pass

    # 5-fold cross-validation (skipped for the continuous regressor)
    if not is_regression:
        try:
            cv = cross_val_score(_make_estimator(model_type), X, y, cv=5, scoring='accuracy')
            metrics['cv_accuracy_mean'] = round(float(cv.mean()), 4)
            metrics['cv_accuracy_std'] = round(float(cv.std()), 4)
        except Exception:
            pass

    if persist and _HAS_JOBLIB:
        try:
            os.makedirs(MODELS_DIR, exist_ok=True)
            joblib.dump({'model': model, 'metrics': metrics},
                        os.path.join(MODELS_DIR, f'{model_type}.joblib'))
        except Exception:
            pass

    return model, metrics


def build_model(model_type=DEFAULT_MODEL):
    """Backwards-compatible helper — returns just the fitted estimator."""
    model, _ = train(model_type, persist=False)
    return model


# ──────────────────────────────────────────────────────────────────────────
# Load / cache
# ──────────────────────────────────────────────────────────────────────────
def _load_persisted(model_type):
    if not _HAS_JOBLIB:
        return None
    path = os.path.join(MODELS_DIR, f'{model_type}.joblib')
    if os.path.exists(path):
        try:
            blob = joblib.load(path)
            return blob.get('model'), blob.get('metrics')
        except Exception:
            return None
    return None


def get_model(model_type=None):
    """Return a cached model, loading from disk or training on first use."""
    global _MODEL, _MODEL_TYPE, _METRICS
    target = model_type or _MODEL_TYPE
    if target != _MODEL_TYPE or _MODEL is None:
        with _LOCK:
            if target != _MODEL_TYPE or _MODEL is None:
                persisted = _load_persisted(target)
                if persisted:
                    _MODEL, _METRICS = persisted
                else:
                    _MODEL, _METRICS = train(target, persist=True)
                _MODEL_TYPE = target
    return _MODEL


def get_metrics(model_type=None):
    """Return the evaluation metrics for the active (or requested) model."""
    global _METRICS
    get_model(model_type)
    if _METRICS is None:
        _, _METRICS = train(model_type or _MODEL_TYPE, persist=True)
    return _METRICS


# ──────────────────────────────────────────────────────────────────────────
# Inference
# ──────────────────────────────────────────────────────────────────────────
def _as_row(cpi, attendance, backlogs, extra_count):
    return np.array([[float(cpi), float(attendance), float(backlogs), float(extra_count)]])


def predict_probability(cpi, attendance, backlogs, extra_count, model_type=None):
    """Return placement-readiness probability in [0, 1]."""
    model = get_model(model_type)
    x = _as_row(cpi, attendance, backlogs, extra_count)
    if hasattr(model, 'predict_proba'):
        prob = model.predict_proba(x)[0][1]
    else:  # linear regression → continuous
        prob = float(np.clip(model.predict(x)[0], 0.0, 1.0))
    return float(np.clip(prob, 0.0, 1.0))


def predict_category(cpi, attendance, backlogs, extra_count, model_type=None):
    """Map probability to a readiness band."""
    p = predict_probability(cpi, attendance, backlogs, extra_count, model_type)
    if p >= 0.75:
        return 'high'
    if p >= 0.55:
        return 'medium'
    if p >= 0.35:
        return 'low'
    return 'critical'


def list_models():
    """Report available algorithms and which ones are persisted on disk."""
    persisted = set()
    if os.path.isdir(MODELS_DIR):
        persisted = {f[:-7] for f in os.listdir(MODELS_DIR) if f.endswith('.joblib')}
    return {
        'active': _MODEL_TYPE,
        'default': DEFAULT_MODEL,
        'supported': SUPPORTED_MODELS,
        'persisted': sorted(persisted),
    }
