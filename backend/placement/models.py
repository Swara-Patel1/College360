from django.db import models


class PlacementCompany(models.Model):
    """A recruiter with eligibility criteria used by the placement predictor."""
    name = models.CharField(max_length=150)
    sector = models.CharField(max_length=50, default='IT')
    package_lpa = models.DecimalField(max_digits=5, decimal_places=1, default=6.0)
    min_cpi = models.DecimalField(max_digits=4, decimal_places=2, default=6.0)
    max_backlogs = models.PositiveSmallIntegerField(default=0)
    min_attendance = models.DecimalField(max_digits=5, decimal_places=2, default=75.0)
    roles = models.CharField(max_length=200, blank=True)
    bond_years = models.PositiveSmallIntegerField(default=0)
    other_criteria = models.CharField(max_length=200, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['-package_lpa', 'name']
        verbose_name_plural = 'Placement companies'

    def __str__(self):
        return f'{self.name} (₹{self.package_lpa} LPA)'
