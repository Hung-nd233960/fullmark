---
title: "Signals and Systems: midterm practice"
id: mockup
description: Practice for the midterm. Three parts, with a suggested time for each.
time_limit: 40m
pass_mark: 80
ui_lang: en
---

# Signals {id=signals time=10m}

## Which signal has finite energy? {type=single id=s1 points=1 tags=energy}

- [x] A decaying exponential
- [ ] A constant
- [ ] A unit step

## A shift in time changes the magnitude spectrum. {type=truefalse id=s2 points=1 tags=shift}

```answer
value: false
```

# Fourier transform {id=fourier time=20m}

## Biến đổi Fourier của một xung chữ nhật có dạng hàm nào? {type=single id=q19 points=1 tags=fourier}

- [x] Hàm sinc
- [ ] Hàm Gauss
- [ ] Hàm mũ suy giảm
- [ ] Hàm delta Dirac

::: explanation
Xung chữ nhật rộng T có phổ T·sinc(fT): cửa sổ trong miền thời gian tương ứng với hàm sinc trong miền tần số. Xung càng hẹp, phổ càng rộng.
:::

## What does `gain(2.5)` return? Give three decimals. {type=numeric id=q20 points=2 tags=frequency-response}

```python
def gain(w: float) -> float:
    # biên độ của H(jω) = 1 / (1 + jω)
    return 1 / math.sqrt(1 + w ** 2)
```

::: hint
|H(jω)| = 1 / √(1 + ω²), so square 2.5 first.
:::

```answer
value: 0.371
tolerance: 0.001
```

::: explanation
|H(jω)| = 1 / √(1 + ω²) = 1 / √7.25 ≈ 0.371.
:::

## What is the effect called when frequencies above fs/2 fold back into the band? {type=short id=q27 points=1 tags=sampling}

```answer
accept: [aliasing]
```

# Sampling {id=sampling time=10m}

## Which of these are conditions of the sampling theorem? {type=multi id=q28 points=2 partial=true tags=sampling}

- [x] The signal is band-limited
- [x] fs is more than twice the highest frequency
- [ ] The signal is periodic
- [ ] The samples are quantised to 16 bits

## Explain why sampling below the Nyquist rate causes aliasing. {type=essay id=q32 points=4}
