---
title: "Timed exam: Introductory statistics"
description: |
  A template for a closed-book exam: a time limit that submits automatically, no feedback until
  the end, shuffled questions and choices, a pass mark, and a random draw from a question bank.
  The answer key is still inside the HTML, so this is practice or honour-system use, not secure proctoring.
time_limit: 20m
on_timeout: submit
feedback: end
shuffle_questions: true
shuffle_choices: true
multi_scoring: all_or_nothing
pass_mark: 60
tags: [statistics]
---

# Part A: Concepts {time=8m}

Answer all questions. You cannot see the correct answers until you submit.

## Which measure of centre is the least affected by extreme values? {id=median tags=descriptive}

- [ ] The mean
- [x] The median
- [ ] The range
- [ ] The standard deviation

> [!explanation]
> The median depends only on the middle of the ordered data, so one extreme value barely moves it. The mean shifts with every value. The range and the standard deviation measure spread, not centre.

## Which of these describe a normal distribution? {id=normal type=multi points=2 tags=distributions}

- [x] It is symmetric about the mean
- [x] The mean, median and mode are equal
- [ ] About 50 % of values lie within one standard deviation of the mean
- [ ] It is always skewed to the right

> [!explanation]
> The normal curve is symmetric, so its mean, median and mode coincide. About 68 % of values (not 50 %) lie within one standard deviation. Right skew describes a different shape. With all-or-nothing scoring both correct choices are needed.

## A p-value of 0.03 means there is a 3 % chance that the null hypothesis is true. {id=pvalue type=truefalse tags=inference}

```answer
value: false
```

> [!explanation]
> The p-value is the probability of data at least this extreme if the null hypothesis were true. It is not the probability that the hypothesis itself is true.

# Part B: Calculations {time=12m}

Show your working on paper. Only the final answer is graded.

## What is the mean of 4, 8, 6, 5 and 7? {id=mean type=numeric tags=descriptive}

```answer
value: 6
```

> [!explanation]
> The sum is 30 and there are 5 values, so the mean is 30 / 5 = 6.

## A sample has mean 50, standard deviation 10 and n = 25. What is the standard error of the mean? {id=sem type=numeric points=2 tags=inference}

```answer
value: 2
tolerance: 0.01
```

> [!explanation]
> The standard error is $s / \sqrt{n} = 10 / 5 = 2$. A common slip is to report the standard deviation itself.

## The [[standard deviation|sd]] is the square root of the [[variance]]. {id=sd-blanks type=blanks tags=descriptive}

> [!explanation]
> Variance is the average squared deviation from the mean, so taking its square root returns to the original units.

# Bonus bank {pick=1}

One question is drawn at random from these two, so learners may see different ones. Use a bank for practice drills; leave it out when everyone must answer the same questions.

## What does a 95 % confidence interval for a mean express? {id=ci-a tags=inference}

- [x] A range that would contain the true mean in about 95 % of repeated samples
- [ ] A range containing 95 % of the individual data values
- [ ] A 95 % probability that the sample mean is correct
- [ ] A range that is always 95 units wide

> [!explanation]
> The 95 % describes the method over repeated samples, not the spread of individual values and not a probability about one fixed interval.

## Increasing the sample size, with everything else fixed, does what to the standard error? {id=ci-b tags=inference}

- [ ] It increases it
- [x] It decreases it
- [ ] It leaves it unchanged
- [ ] It makes it negative

> [!explanation]
> The standard error is $s / \sqrt{n}$, so a larger $n$ makes it smaller, and the estimate more precise.
