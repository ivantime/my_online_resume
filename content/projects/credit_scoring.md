---
title: Credit Scoring using Supervised Learning (Logistic Regression)
date: 2022-06-01
summary: Predictive Credit Scores with Applicable Scorecard Utilization
tags: [data-engineering]
featured: true
role: Solo project
tools: [Python, pandas, scikit-learn, Matplotlib]
cover: /images/credit_scoring/credit_scoring_gif_landpage.gif
coverScale: 30
coverAlt: ROC curve of the tuned logistic regression credit scoring model
coverSource: https://assets-v2.lottiefiles.com/a/136193f2-116d-11ee-91f9-33511e173420/1Thhdx8K1z.gif
links:
  - Source on GitHub | https://github.com/ivantime/SIT-Credit-Scoring-Capstone-Repo
  - Full Capstone Report (PDF) | https://github.com/ivantime/SIT-Credit-Scoring-Capstone-Repo/blob/main/Capstone%20Final%20Trimester%20Report%20(Academic%20Project).pdf
---
From Raw Loan Records to a 300 to 850 Credit Scorecard

## The Problem

Approving a loan that is never repaid is costly, and scoring every applicant by hand is slow and error-prone. This project aims to build an automated Credit Scoring System with Logistic Regression (LR) that:
- Predicts if a new applicant will repay (Good) or default (Bad), learning from about 2.26 million past loans
- Turns the model into a Scorecard (300 to 850, the FICO range) that a person can read and check
- Tests two gaps in earlier studies: LR used without Model Tuning, and without Feature Scaling

## Prepare the Data

Starting from 145 raw features, we:
- Dropped features that were mostly empty (over 80% missing) and ID-like columns
- Labelled each loan from its status: Charged Off, Default or Late is Bad (0), everything else is Good (1)
- Split 80/20 (1,808,534 training and 452,134 test loans), keeping the same Good/Bad mix in both, then fitted every step on the training set only

```python terminal file="prepare.py"
# drop features that are more than 80% empty
loan_data.dropna(thresh = loan_data.shape[0]*0.2, how = 'all', axis = 1, inplace = True)

# target: 0 = Bad (charged off, default, late), 1 = Good
loan_data['good_bad'] = np.where(loan_data.loc[:, 'loan_status'].isin(['Charged Off', 'Default', 'Late (31-120 days)',
                                                                       'Does not meet the credit policy. Status:Charged Off']), 0, 1)

# 80/20 split, stratified so both sets keep the same Good/Bad mix
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size = 0.2, random_state = 42, stratify = y)
```

## Select the Features

Keeping only the features that separate Good from Bad loans:
- Chi-Squared test for categorical features (top 4 kept)
- ANOVA F-Statistic for numerical features (top 20 kept)
- Pair-wise correlations to spot near-duplicates: out_prncp_inv and total_pymnt_inv were dropped

```python terminal file="select_features.py" img="/images/credit_scoring/credit_scoring_correlation.png" alt="Correlation heatmap of the top 20 numerical features" caption="Correlation of the top 20 numerical features: near-duplicate pairs stand out."
# Chi-Squared p-value per categorical feature (the smaller, the stronger the link to Good/Bad)
for column in X_train_cat:
    chi, p, dof, ex = chi2_contingency(pd.crosstab(y_train, X_train_cat[column]))

# ANOVA F-Statistic per numerical feature (the larger, the stronger the link)
F_statistic, p_values = f_classif(X_train_num, y_train)

# correlation between each pair of the top 20 features
corrmat = X_train_num[top_num_features].corr()
sns.heatmap(corrmat)
```

## Weight of Evidence (WoE) and Information Value (IV)

Each feature is split into groups (bins) and each bin is scored by how much it favours Good over Bad loans:

<div class="eq"><math display="block"><mrow><msub><mi>WoE</mi><mi>i</mi></msub><mo>=</mo><mi>ln</mi><mo>&#x2061;</mo><mo>(</mo><mfrac><msub><mi>g</mi><mi>i</mi></msub><msub><mi>b</mi><mi>i</mi></msub></mfrac><mo>)</mo></mrow></math></div>
<div class="eq"><math display="block"><mrow><mi>IV</mi><mo>=</mo><munder><mo>&#x2211;</mo><mi>i</mi></munder><mo>(</mo><msub><mi>g</mi><mi>i</mi></msub><mo>&#x2212;</mo><msub><mi>b</mi><mi>i</mi></msub><mo>)</mo><mo>&#xD7;</mo><msub><mi>WoE</mi><mi>i</mi></msub></mrow></math></div>

<p class="eq-note">where <i>g<sub>i</sub></i> is the share of all Good loans that fall in bin <i>i</i>, and <i>b<sub>i</sub></i> is the share of all Bad loans in bin <i>i</i>.</p>

- A positive WoE means the bin is mostly Good loans, a negative WoE mostly Bad loans (grade A is +1.38, grade G is -1.52)
- IV adds this up per feature to rank how useful it is. pymnt_plan (IV under 0.02) was dropped as too weak, while out_prncp and mths_since_last_pymnt_d were dropped for a suspiciously high IV
- Numerical features are first cut into fine bins (eg. 20 equal ranges of int_rate), then neighbouring bins with a similar WoE are combined

```python terminal file="woe.py" img="/images/credit_scoring/credit_scoring_woe_grade.png" alt="Weight of Evidence table for loan grade" caption="WoE of loan grade G to A: from mostly Bad to mostly Good (IV = 0.48)."
def woe_discrete(df, cat_variabe_name, y_df):
    df = pd.concat([df[cat_variabe_name], y_df], axis = 1)
    df = pd.concat([df.groupby(df.columns.values[0], as_index = False)[df.columns.values[1]].count(),
                    df.groupby(df.columns.values[0], as_index = False)[df.columns.values[1]].mean()], axis = 1)
    df = df.iloc[:, [0, 1, 3]]
    df.columns = [df.columns.values[0], 'n_obs', 'prop_good']
    df['n_good'] = df['prop_good'] * df['n_obs']
    df['n_bad'] = (1 - df['prop_good']) * df['n_obs']
    df['prop_n_good'] = df['n_good'] / df['n_good'].sum()
    df['prop_n_bad'] = df['n_bad'] / df['n_bad'].sum()
    df['WoE'] = np.log(df['prop_n_good'] / df['prop_n_bad'])
    df['IV'] = (df['prop_n_good'] - df['prop_n_bad']) * df['WoE']
    df['IV'] = df['IV'].sum()
    return df.sort_values(['WoE'])

woe_discrete(X_train_prepr, 'grade', y_train_prepr)
```

## Bin the Features, then Model

The chosen bins are packed into one custom scikit-learn class (WoE_Binning), so the same binning is applied to any dataset and can sit inside a pipeline with cross-validation:
- Categories with a similar WoE are merged (eg. grade E, F and G become one bin)
- Numerical features are turned into 0/1 columns, one per bin
- One bin per feature is left out as its reference category, which later scores 0 points

```python terminal file="woe_binning.py"
class WoE_Binning(BaseEstimator, TransformerMixin):
    def __init__(self, X):
        self.X = X
    def fit(self, X, y = None):
        return self

    def transform(self, X):
        # merge categories with a similar WoE
        X_new = X.loc[:, ['grade:A']]
        X_new['grade:E_F_G'] = sum([X['grade:E'], X['grade:F'], X['grade:G']])
        X_new['home_ownership:MORTGAGE_ANY'] = sum([X['home_ownership:MORTGAGE'], X['home_ownership:ANY']])

        # one 0/1 column per bin of each numerical feature
        X_new['int_rate:<6.594'] = np.where((X['int_rate'] <= 6.594), 1, 0)
        X_new['int_rate:6.594-7.878'] = np.where((X['int_rate'] > 6.594) & (X['int_rate'] <= 7.878), 1, 0)
        # ... and the same for every other selected feature
        return X_new
```

## Tune and Compare Four Pipelines

The Capstone's two gaps, tested by fitting the same WoE-binned data through four LR pipelines:
1. LR only
2. LR with Grid Search Tuning
3. LR with Standard Scaler (Feature Scaling)
4. LR with Standard Scaler and Grid Search Tuning

Grid Search tried the solver and regularization strength (C) using 10-fold cross-validation repeated 3 times, scored on AUROC. The first line below is LR only, the second is LR with the scaler:

```python terminal file="tune_and_compare.py" img="/images/credit_scoring/credit_scoring_tuning_output.png" layout="stack" alt="Best Grid Search parameters and the AUROC and Gini scores of the four pipelines" caption="Best parameters found by Grid Search, then the AUROC and Gini of all four pipelines."
reg = LogisticRegression(max_iter=1000)
pipeline = Pipeline(steps=[('woe', WoE_Binning(X)), ('model', reg)])
pipelineScal = Pipeline(steps=[('woe', WoE_Binning(X)), ('sca', StandardScaler()), ('model', reg)])

param = {"model__penalty": ['l2'],
         "model__solver": ['newton-cg', 'lbfgs', 'liblinear'],
         "model__C": np.logspace(-4, 4, 4)}
cv = RepeatedStratifiedKFold(n_splits=10, n_repeats=3, random_state=1)
grid_search = GridSearchCV(estimator=pipeline, param_grid=param, cv=cv, scoring='roc_auc')
grid_result = grid_search.fit(X_train, y_train)
print("Best: %f using %s" % (grid_result.best_score_, grid_result.best_params_))

# AUROC and Gini (2 x AUROC - 1) of each pipeline
scores = cross_val_score(pipeline, X_train, y_train, scoring = 'roc_auc', cv = cv)
AUROC = np.mean(scores)
GINI = AUROC * 2 - 1
```

## Evaluate the Results

| Pipeline | Tuned? | Feature Scaling? | AUROC | Gini |
|---|---|---|---|---|
| 1 | No | No | 0.907936 | 0.815871 |
| 2 | Yes | No | 0.907945 | 0.815890 |
| 3 | No | Yes | 0.907945 | 0.815891 |
| 4 | Yes | Yes | 0.907945 | 0.815891 |

- All four pipelines score an AUROC of about 0.908 (Gini 0.816): WoE Binning does most of the work
- Tuning and scaling only add a small gain (the differences show from the 5th decimal), with Pipeline 4 (both) scoring highest and getting a handful more predictions right than Pipeline 1
- On the 452,134 test loans, Pipeline 4 approved 98% of the Good loans (387,328 of 395,265) and caught 46% of the Bad loans (26,122 of 56,869) at the default cut-off

```python terminal file="evaluate.py" img="/images/credit_scoring/credit_scoring_confusion.png" alt="Confusion matrices of the two tuned pipelines on the test set" caption="Confusion matrices on the test set: LR (left) and LR with Standard Scaler (right), both tuned."
pipeline.fit(X_train, y_train)
y_pred = pipeline.predict(X_test)

cf_matrix = confusion_matrix(y_test, y_pred)
sns.heatmap(cf_matrix, annot=True, cmap='Blues', fmt='g')
```

![ROC curve of the two tuned pipelines](/images/credit_scoring/credit_scoring_roc.png "ROC curves of the two tuned pipelines: the lines sit on top of each other.")

## Turn the Model into a Scorecard

A Scorecard is easier to explain than raw model coefficients. Each bin's coefficient is rescaled into points so that the lowest and highest possible totals land on 300 and 850:

<div class="eq"><math display="block"><mrow><msub><mi>Points</mi><mi>j</mi></msub><mo>=</mo><msub><mi>&#x3B2;</mi><mi>j</mi></msub><mo>&#xD7;</mo><mfrac><mrow><msub><mi>S</mi><mtext>max</mtext></msub><mo>&#x2212;</mo><msub><mi>S</mi><mtext>min</mtext></msub></mrow><mrow><mo>&#x2211;</mo><mi>max</mi><mo>&#x2061;</mo><mi>&#x3B2;</mi><mo>&#x2212;</mo><mo>&#x2211;</mo><mi>min</mi><mo>&#x2061;</mo><mi>&#x3B2;</mi></mrow></mfrac></mrow></math></div>
<div class="eq"><math display="block"><mrow><msub><mi>Base</mi><mtext>score</mtext></msub><mo>=</mo><mfrac><mrow><msub><mi>&#x3B2;</mi><mn>0</mn></msub><mo>&#x2212;</mo><mo>&#x2211;</mo><mi>min</mi><mo>&#x2061;</mo><mi>&#x3B2;</mi></mrow><mrow><mo>&#x2211;</mo><mi>max</mi><mo>&#x2061;</mo><mi>&#x3B2;</mi><mo>&#x2212;</mo><mo>&#x2211;</mo><mi>min</mi><mo>&#x2061;</mo><mi>&#x3B2;</mi></mrow></mfrac><mo>&#xD7;</mo><mo>(</mo><msub><mi>S</mi><mtext>max</mtext></msub><mo>&#x2212;</mo><msub><mi>S</mi><mtext>min</mtext></msub><mo>)</mo><mo>+</mo><msub><mi>S</mi><mtext>min</mtext></msub></mrow></math></div>

<p class="eq-note">where <i>&beta;<sub>j</sub></i> is the model coefficient of bin <i>j</i> and <i>&beta;<sub>0</sub></i> is the intercept. <i>S</i><sub>min</sub> = 300 and <i>S</i><sub>max</sub> = 850. &sum;max <i>&beta;</i> and &sum;min <i>&beta;</i> add up, over the original features, the largest and smallest coefficient among each feature's bins.</p>

- The intercept becomes the base score (599), and each bin adds or removes points from it (eg. grade A adds 26)
- The possible totals come out at 301 to 849, inside the 300 to 850 range

```python terminal file="scorecard.py" img="/images/credit_scoring/credit_scoring_scorecard.png" layout="stack" alt="Scorecard table with the coefficient and points of each bin" caption="The Scorecard: points per bin, with the Intercept as the base score."
min_score = 300
max_score = 850

# sum of each feature's smallest and largest coefficient
min_sum_coef = df_scorecard.groupby('Original feature name')['Coefficients'].min().sum()
max_sum_coef = df_scorecard.groupby('Original feature name')['Coefficients'].max().sum()

# rescale each coefficient into points
df_scorecard['Score - Calculation'] = df_scorecard['Coefficients'] * (max_score - min_score) / (max_sum_coef - min_sum_coef)

# the intercept becomes the base score
df_scorecard.loc[0, 'Score - Calculation'] = ((df_scorecard.loc[0,'Coefficients'] - min_sum_coef) / (max_sum_coef - min_sum_coef)) * (max_score - min_score) + min_score
df_scorecard['Score - Preliminary'] = df_scorecard['Score - Calculation'].round()
```

## Score New Applicants

An applicant's score is the sum of the points of the bins they fall into, so every score can be explained:

```python terminal file="score_applicants.py" img="/images/credit_scoring/credit_scoring_scores.png" alt="Scores of the first five applicants in the test set" caption="Scores of the first five test applicants."
# WoE-bin the test set and add an Intercept column of 1s
X_test_woe_transformed = WoE_Binning(X).fit_transform(X_test)
X_test_woe_transformed.insert(0, 'Intercept', 1)

# applicant score = sum of the points of their bins
y_scores = X_test_woe_transformed.dot(scorecard_scores)
y_scores.head()
```

## The Full Capstone Report

The report covers the literature review behind the two gaps, the method in full and a scorecard walk-through:

```pdf src="https://raw.githubusercontent.com/ivantime/SIT-Credit-Scoring-Capstone-Repo/main/Capstone%20Final%20Trimester%20Report%20(Academic%20Project).pdf" page="34" width="80%" ratio="210/297" title="Capstone Report, results page" caption="Capstone Report: results of the four pipelines (Table 2)."
```

## Moving Ahead: Possible Future Improvements

As with all Projects future improvements are in order, such as:
- Choosing the approval cut-off score to suit the lender, since at the default cut-off the model catches 46% of Bad loans
- Fine-tuning the Scorecard so its possible range lands exactly on 300 to 850 (currently 301 to 849)
