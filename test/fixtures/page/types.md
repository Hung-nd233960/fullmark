---
title: Simple types
id: types
---

# Everything

## Pick the colour of the sky. {type=single id=s1}

- [ ] Green
- [x] Blue skyvalue
- [ ] Red

## Which of these are prime? {type=multi id=m1 points=2}

- [x] Two
- [ ] Four
- [x] Three
- [ ] Six

## The sky is green. {type=truefalse id=t1}

```answer
value: false
```

## What is the standard error in metres? {type=numeric id=n1}

```answer
value: 7391.25
tolerance: 0.5
unit: m
```

## What is the ratio of a circle's circumference to its diameter, within 1 %? {type=numeric id=n2}

```answer
value: 3.14
rel_tolerance: 0.01
```

## What is five divided by two? {type=numeric id=n3}

```answer
value: 2.5
```

## Name the zqpatternword of the greeting. {type=short id=h1}

```answer
accept: ["zq-accept-alpha", "zq-accept-beta"]
```

## Name the second one. {type=short id=h2}

```answer
patterns: ['^zq-pat-[0-9]+$']
```

## The [[plorbix|plorbax]] is the root of the [[=0.0481±0.001]]. {type=blanks id=b1 points=3}

Also [[quuxle]] here, and `a[[0]]` is code, not a blank.

```text
let [[wibble]] = 1;
```

## Calculations {type=fields id=f1 points=4}

```answer
fields:
  - label: "Pulse (bpm)"
    value: 4242.5
    tolerance: 0.1
  - label: "Name"
    accept: ["zq-field-name"]
  - label: "Note (not scored)"
```

## How sure are you? {type=scale id=c1}

```answer
min: 1
max: 5
labels:
  1: Not at all
  5: Very sure
```
