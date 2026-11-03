---
title: Key types
---

## Single {type=single id=k-single points=1}

- [ ] one
- [x] two
- [ ] three

## Multi {type=multi id=k-multi points=2}

- [x] one
- [ ] two
- [x] three

## Even {type=truefalse id=k-tf points=1}

```answer
value: false
```

## Short {type=short id=k-short points=1}

```answer
accept: [aliasing, folding]
patterns: ["alias(ing)?"]
```

## Num {type=numeric id=k-num points=1}

```answer
value: 0.4
tolerance: 0.001
unit: s
```

## Rel {type=numeric id=k-rel points=1}

```answer
value: 100
rel_tolerance: 0.05
```

## Blanks [[causal|casual]] and [[=2±0.5]] {type=blanks id=k-blanks points=2}

## Fields {type=fields id=k-fields points=2}

```answer
fields:
  - label: "Gain"
    value: 12
    tolerance: 0.5
    unit: dB
    points: 1
  - label: "Name"
    accept: [x]
    points: 1
```

## Match {type=matching id=k-match points=3}

- p :: a
- q :: b
- r :: c

## Order {type=ordering id=k-order points=3}

1. first
2. second
3. third

## Scale {type=scale id=k-scale}

```answer
min: 1
max: 5
```

## Essay {type=essay id=k-essay points=4}

```answer
rubric:
  mode: additive
  criteria:
    - One (2 pts)
    - Two (2 pts)
```

## Code {type=code id=k-code points=3}

```answer
language: python
```
