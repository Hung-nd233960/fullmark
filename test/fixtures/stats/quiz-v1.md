---
title: Study fixture
id: study
pass_mark: 50
---

# Part one {id=part-one}

## Which number is prime? {type=single id=prime tags=numbers}

- [ ] Four
- [x] Seven
- [ ] Nine

## Zero is even. {type=truefalse id=even tags=numbers}

```answer
value: true
```

## Which one is a syllogism? {type=single id=syll tags=logic}

- [x] All men are mortal; Socrates is a man; so Socrates is mortal
- [ ] It rained, so the grass is wet
- [ ] Two plus two is four

## Pick the odd one out. {type=single id=odd}

- [ ] Red
- [ ] Blue
- [x] Square

# Part two {id=part-two}

## Describe the process. {type=essay id=add points=3 tags=writing}

```answer
rubric:
  mode: additive
  step: 0.25
  criteria:
    - id: defs
      text: Define the terms
      points: 0.5
    - id: derive
      text: Derive the result
      points: 1.5
    - id: interp
      text: Interpret it
      points: 1
```

## To what extent do you agree? {type=essay id=ielts points=9 tags=writing}

```answer
rubric:
  preset: ielts-writing-task2
```
