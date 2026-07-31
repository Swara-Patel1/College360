"""Serializers for the placement-prediction API."""
from rest_framework import serializers

from . import ml


class PredictInputSerializer(serializers.Serializer):
    """Validates a manual placement-readiness prediction request."""
    cpi = serializers.FloatField(min_value=0.0, max_value=10.0)
    attendance = serializers.FloatField(min_value=0.0, max_value=100.0)
    backlogs = serializers.IntegerField(min_value=0, max_value=20, required=False, default=0)
    extra = serializers.IntegerField(min_value=0, max_value=10, required=False, default=0)
    model_type = serializers.ChoiceField(
        choices=ml.SUPPORTED_MODELS, required=False, default=ml.DEFAULT_MODEL
    )


class RetrainInputSerializer(serializers.Serializer):
    """Validates a (re)train request."""
    model_type = serializers.ChoiceField(
        choices=ml.SUPPORTED_MODELS, required=False, default=ml.DEFAULT_MODEL
    )
