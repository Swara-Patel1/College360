"""Unit tests for the placement ML module (no server / DB required)."""
import pytest

from placement import ml

pytestmark = pytest.mark.unit


def test_supported_models_nonempty():
    assert 'random_forest' in ml.SUPPORTED_MODELS
    assert ml.DEFAULT_MODEL in ml.SUPPORTED_MODELS
    assert len(ml.SUPPORTED_MODELS) >= 4


def test_feature_names():
    assert ml.FEATURE_NAMES == ['cpi', 'attendance', 'backlogs', 'extra']


def test_train_returns_metrics():
    model, metrics = ml.train('random_forest', persist=False)
    assert model is not None
    for key in ('accuracy', 'precision', 'recall', 'f1', 'confusion_matrix', 'n_train', 'n_test'):
        assert key in metrics
    assert 0.6 <= metrics['accuracy'] <= 1.0
    cm = metrics['confusion_matrix']
    assert len(cm) == 2 and len(cm[0]) == 2


@pytest.mark.parametrize('model_type', ml.SUPPORTED_MODELS)
def test_every_model_trains_and_scores(model_type):
    _, metrics = ml.train(model_type, persist=False)
    # A useful model must clear a modest accuracy bar on this separable dataset.
    assert metrics['accuracy'] >= 0.7, f'{model_type} scored {metrics["accuracy"]}'


def test_probability_in_range():
    p = ml.predict_probability(7.5, 85, 0, 2)
    assert 0.0 <= p <= 1.0


def test_probability_monotonic_in_cpi():
    """A stronger CPI (all else equal) should not lower placement readiness."""
    low = ml.predict_probability(5.0, 80, 1, 1)
    high = ml.predict_probability(9.0, 80, 1, 1)
    assert high >= low


def test_backlogs_reduce_readiness():
    clean = ml.predict_probability(8.0, 85, 0, 2)
    backlogged = ml.predict_probability(8.0, 85, 5, 2)
    assert clean >= backlogged


@pytest.mark.parametrize('cpi,expected', [
    (9.8, 'high'),
    (3.5, 'critical'),
])
def test_category_bands(cpi, expected):
    cat = ml.predict_category(cpi, 90 if cpi > 8 else 45, 0 if cpi > 8 else 5, 3 if cpi > 8 else 0)
    assert cat in ('high', 'medium', 'low', 'critical')
    if expected == 'high':
        assert cat in ('high', 'medium')
    if expected == 'critical':
        assert cat in ('critical', 'low')


def test_feature_importance_normalised():
    _, metrics = ml.train('random_forest', persist=False)
    fi = metrics.get('feature_importance')
    assert fi is not None
    assert abs(sum(fi.values()) - 1.0) < 0.01


def test_list_models_shape():
    info = ml.list_models()
    assert set(['active', 'default', 'supported']).issubset(info.keys())
    assert info['supported'] == ml.SUPPORTED_MODELS


def test_unknown_model_raises():
    with pytest.raises(ValueError):
        ml.train('not_a_real_model', persist=False)
