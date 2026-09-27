# Reproducible normalization evidence

Run `python -B scripts/normalization_report.py --check`. The script creates a fresh temporary database, imports the host fixtures, calls the production scoring function, and compares every exported value with [docs/normalization-fixtures.csv](docs/normalization-fixtures.csv). It never changes your running database. Omit `--check` to regenerate the evidence.

The fixture contains 41 project rows and 126 stored reviews. The duplicate `prj_41` and its four reviews are excluded from scoring, leaving 40 scored projects and 122 eligible reviews. Coverage ranges from two to five completed reviews per project. All adjusted scores are finite and within 1–5. Four projects change their within-track rank. The CSV includes raw and adjusted scores, both ranks, review counts, and duplicate references for every project, including the excluded duplicate. Ties share a competition rank; subsequent positions skip accordingly.

## What the correction guarantees

Within each track, let `M` be the mean raw review, `M_j` the judge's mean, and `n_j` their review count. Before the final 1–5 clamp, the adjusted judge mean is:

```text
M_j' = M_j − n_j/(n_j+4) × (M_j−M)
M_j' − M = 4/(n_j+4) × (M_j−M)
```

Thus the deviation from the original track mean shrinks by a known factor. A judge with one review gets a small correction; one with more evidence gets a larger correction. Clipping limits out-of-range results but means that exact identity need not hold after clipping. The implementation never divides by a standard deviation, so constant-score judges do not create undefined values. The fixture contains one judge/track group with multiple identical raw scores.

This is a proof of the correction's arithmetic behavior, **not proof of unbiased estimates of project quality**. Judge severity and the quality of assigned projects are confounded when review groups differ. The observed rank changes do not prove the new order is objectively better. Balanced assignment, track scopes, review-count visibility, and preservation of raw scores support organizer inspection. Connected overlapping assignments and a more advanced estimator would be possible future work.

## Controlled regression

`python -B -m unittest discover -s tests -k test_t2_normalization` exercises the scorer through actual API reviews. Judge A gives projects P0/P1/P2 scores 5/4/3; judge B gives only P0/P1 scores 1/1. The track mean is 2.8. A's correction is `(3/7) × (4−2.8) = 0.5142857`; B's is `(2/6) × (1−2.8) = −0.6`.

| Project | Reviews | Raw | Adjusted |
| --- | --- | --- | --- |
| P0 | A=5, B=1 | 3.0 | 3.042857 |
| P1 | A=4, B=1 | 2.5 | 2.542857 |
| P2 | A=3 | 3.0 | 2.485714 |

The test checks these numerical expectations and finite results. It deliberately combines constant scoring, uneven coverage, and a raw-score tie. Separate tests verify rubric weights, score bounds, incomplete reviews, frozen publication, duplicate exclusion, and CSV agreement with the published snapshot. See [JUDGING.md](JUDGING.md) for the full scoring policy.
