"""
Placement-readiness predictor.

A small logistic-regression model, trained with batch gradient descent on
synthetic-but-realistic data (numpy only — no scikit-learn dependency), that maps
a student's academic profile to a placement-readiness probability.

Features (in order): normalized CPI, normalized attendance, backlog count, extracurricular signal.
The model is trained once per process and cached in `_MODEL`.
"""
import threading
import numpy as np

_MODEL = None
_LOCK = threading.Lock()

FEATURE_NAMES = ['cpi', 'attendance', 'backlogs', 'extra']


def _sigmoid(z):
    return 1.0 / (1.0 + np.exp(-np.clip(z, -30, 30)))


class LogisticRegressionNP:
    """Minimal L2-regularized logistic regression trained via gradient descent."""

    def __init__(self, n_features):
        self.w = np.zeros(n_features)
        self.b = 0.0
        self.mean = np.zeros(n_features)
        self.std = np.ones(n_features)

    def fit(self, X, y, lr=0.1, epochs=400, l2=1e-3):
        self.mean = X.mean(axis=0)
        self.std = X.std(axis=0) + 1e-9
        Xs = (X - self.mean) / self.std
        n = len(y)
        for _ in range(epochs):
            p = _sigmoid(Xs @ self.w + self.b)
            err = p - y
            self.w -= lr * (Xs.T @ err / n + l2 * self.w)
            self.b -= lr * err.mean()
        return self

    def predict_proba(self, x):
        xs = (np.asarray(x, dtype=float) - self.mean) / self.std
        return float(_sigmoid(xs @ self.w + self.b))


def _synthesize(n=4000, seed=42):
    """Generate a labelled training set from a plausible placement process."""
    rng = np.random.default_rng(seed)
    cpi = rng.uniform(4.0, 10.0, n)
    attendance = rng.uniform(40.0, 100.0, n)
    backlogs = rng.poisson(1.0, n).clip(0, 8).astype(float)
    extra = rng.integers(0, 4, n).astype(float)  # count of activities 0-3

    # Ground-truth placement tendency (recruiters weight CPI + attendance, penalize backlogs).
    z = (1.25 * (cpi - 6.7)
         + 0.045 * (attendance - 72.0)
         - 0.95 * backlogs
         + 0.35 * extra)
    prob = _sigmoid(z)
    y = (prob > rng.uniform(0, 1, n)).astype(float)
    X = np.column_stack([cpi, attendance, backlogs, extra])
    return X, y


def get_model():
    global _MODEL
    if _MODEL is None:
        with _LOCK:
            if _MODEL is None:
                X, y = _synthesize()
                _MODEL = LogisticRegressionNP(X.shape[1]).fit(X, y)
    return _MODEL


def predict_probability(cpi, attendance, backlogs, extra_count):
    model = get_model()
    return model.predict_proba([cpi, attendance, backlogs, extra_count])
