---
title: Maths and code
id: maths-and-code
materials:
  - materials/formulas.md
---

## What is the value of $\int_0^1 x^2\,dx$? {type=single id=s1}

The area under the curve, written $y = x^2$, is the display

$$\int_0^1 x^2\,dx = \frac{1}{3}$$

- [ ] $\frac{1}{2}$
- [x] $\frac{1}{3}$
- [ ] $\sqrt{2}$

::: explanation
Integrate: $\left[\frac{x^3}{3}\right]_0^1 = \frac13$. In code:

```python
def area(n):
    return sum((i / n) ** 2 for i in range(n)) / n
```

:::

## Complete the function. {type=blanks id=b1}

```python
def square(x):
    return x [[**]] 2
```

## Match each function to its derivative. {type=matching id=g1}

- $x^2$ :: $2x$
- $\sin x$ :: $\cos x$
- $e^x$ :: $e^x$

## Write a function that doubles its argument. {type=code id=k1}

```answer
language: rust
starter: "fn double(x: i32) -> i32 {\n    todo!()\n}"
sample_answer: "fn double(x: i32) -> i32 {\n    x * 2\n}"
rubric:
  - Returns twice the argument
  - Uses the right type
  - Has no leftover todo
```
