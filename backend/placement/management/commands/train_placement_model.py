"""
Management command: train the placement-readiness model(s) and print metrics.

Usage:
    python manage.py train_placement_model                 # trains the default (random_forest)
    python manage.py train_placement_model --model knn     # trains a specific algorithm
    python manage.py train_placement_model --all           # trains and compares every algorithm
"""
from django.core.management.base import BaseCommand, CommandError

from placement import ml


class Command(BaseCommand):
    help = 'Train and evaluate the placement-readiness ML model(s).'

    def add_arguments(self, parser):
        parser.add_argument('--model', default=ml.DEFAULT_MODEL,
                            help=f'Algorithm to train {ml.SUPPORTED_MODELS}')
        parser.add_argument('--all', action='store_true',
                            help='Train and compare every supported algorithm.')

    def handle(self, *args, **opts):
        targets = ml.SUPPORTED_MODELS if opts['all'] else [opts['model']]
        for t in targets:
            if t not in ml.SUPPORTED_MODELS:
                raise CommandError(f'Unknown model {t!r}. Choose from {ml.SUPPORTED_MODELS}.')

        self.stdout.write(self.style.MIGRATE_HEADING(
            f'Training {len(targets)} model(s): {", ".join(targets)}'))

        results = []
        for t in targets:
            _, m = ml.train(t, persist=True)
            results.append(m)
            self.stdout.write('')
            self.stdout.write(self.style.SUCCESS(f'  [OK] {t}  ({m["algorithm"]})'))
            self.stdout.write(f'      samples    : {m["n_train"]} train / {m["n_test"]} test')
            self.stdout.write(f'      accuracy   : {m["accuracy"]}')
            self.stdout.write(f'      precision  : {m["precision"]}   recall: {m["recall"]}   f1: {m["f1"]}')
            if 'roc_auc' in m:
                self.stdout.write(f'      roc_auc    : {m["roc_auc"]}')
            if 'cv_accuracy_mean' in m:
                self.stdout.write(f'      cv accuracy: {m["cv_accuracy_mean"]} +/- {m.get("cv_accuracy_std", 0)}')
            if m.get('feature_importance'):
                fi = ', '.join(f'{k}={v}' for k, v in m['feature_importance'].items())
                self.stdout.write(f'      importance : {fi}')
            self.stdout.write(f'      confusion  : {m["confusion_matrix"]}')

        if len(results) > 1:
            best = max(results, key=lambda r: r['accuracy'])
            self.stdout.write('')
            self.stdout.write(self.style.MIGRATE_HEADING('Comparison (by accuracy):'))
            for m in sorted(results, key=lambda r: r['accuracy'], reverse=True):
                marker = '*' if m is best else ' '
                self.stdout.write(f'   {marker} {m["model_type"]:<18} acc={m["accuracy"]}  f1={m["f1"]}')
            self.stdout.write(self.style.SUCCESS(f'\nBest: {best["model_type"]} (accuracy {best["accuracy"]})'))

        self.stdout.write(self.style.SUCCESS('\nDone. Models persisted to placement/models/.'))
