---
title: "Signals and Systems: midterm practice"
id: board
time_limit: 45m
---

# Part I. Signals

## Which signal is periodic? {type=single id=b01 points=1}

- [ ] x(t) = $e^{-t}$
- [x] x(t) = $\cos(4\pi t)$
- [ ] x(t) = $t\,u(t)$
- [ ] x(t) = $\delta(t-1)$

## True or false: an even signal satisfies x(t) = x(−t). {type=truefalse id=b02 points=1}

```answer
value: true
```

## What is the fundamental period, in seconds, of x(t) = sin(5πt)? {type=numeric id=b03 points=1}

```answer
value: 0.4
tolerance: 0.001
```

## Fill in the blank. A system whose output depends only on present and past inputs is called [[causal]]. {type=blanks id=b04 points=1}

## Match each signal with its Fourier transform. {type=matching id=b05 points=2}

- rect(t) :: sinc(ω / 2π)
- 1 :: 2π·δ(ω)
- δ(t) :: 1

## Which statement about a Fourier series is correct? {type=single id=b06 points=1}

- [ ] It holds for a Fourier series in general
- [ ] It never holds for a Fourier series
- [x] It holds only when the signal is periodic
- [ ] It depends on the sampling rate alone

## Which statement about aliasing is correct? {type=single id=b07 points=1}

- [ ] It holds for aliasing in general
- [ ] It never holds for aliasing
- [ ] It holds only when the signal is periodic
- [x] It depends on the sampling rate alone

## True or false: statement 8 about a linear system holds. {type=truefalse id=b08 points=1}

```answer
value: true
```

## Which statement about sampling is correct? {type=single id=b09 points=1}

- [ ] It holds for sampling in general
- [x] It never holds for sampling
- [ ] It holds only when the signal is periodic
- [ ] It depends on the sampling rate alone

## Name the effect when frequencies above fs/2 fold back into the band. {type=short id=b10 points=1}

```answer
accept: [aliasing]
```

## Which statement about an LTI system is correct? {type=single id=b11 points=1}

- [ ] It holds for an LTI system in general
- [ ] It never holds for an LTI system
- [ ] It holds only when the signal is periodic
- [x] It depends on the sampling rate alone

# Part II. Systems

## Which statement about the Laplace transform is correct? {type=single id=b12 points=1}

- [x] It holds for the Laplace transform in general
- [ ] It never holds for the Laplace transform
- [ ] It holds only when the signal is periodic
- [ ] It depends on the sampling rate alone

## Which statement about a stable filter is correct? {type=single id=b13 points=1}

- [ ] It holds for a stable filter in general
- [x] It never holds for a stable filter
- [ ] It holds only when the signal is periodic
- [ ] It depends on the sampling rate alone

## True or false: statement 14 about a linear system holds. {type=truefalse id=b14 points=1}

```answer
value: true
```

## Put the steps of designing a digital filter in order. {type=ordering id=b15 points=2}

1. State the specification
2. Choose the filter type
3. Compute the coefficients
4. Check the response

## Which statement about a Fourier series is correct? {type=single id=b16 points=1}

- [x] It holds for a Fourier series in general
- [ ] It never holds for a Fourier series
- [ ] It holds only when the signal is periodic
- [ ] It depends on the sampling rate alone

## Which statement about aliasing is correct? {type=single id=b17 points=1}

- [ ] It holds for aliasing in general
- [x] It never holds for aliasing
- [ ] It holds only when the signal is periodic
- [ ] It depends on the sampling rate alone

## Which of these are conditions of the sampling theorem? {type=multi id=b18 points=2 partial=true}

- [x] The signal is band-limited
- [x] fs is more than twice the highest frequency
- [ ] The signal is periodic
- [ ] The samples are quantised to 16 bits

## Which statement about sampling is correct? {type=single id=b19 points=1}

- [ ] It holds for sampling in general
- [ ] It never holds for sampling
- [ ] It holds only when the signal is periodic
- [x] It depends on the sampling rate alone

## Readings {type=fields id=b20 points=2}

```answer
fields:
  - label: Gain (dB)
    value: 3
  - label: Cutoff (Hz)
    value: 100
```

## What does gain(2.5) return, to three decimals? {type=numeric id=b21 points=1}

```answer
value: 0.371
tolerance: 0.001
```

# Part III. Sampling

## Which statement about the Laplace transform is correct? {type=single id=b22 points=1}

- [ ] It holds for the Laplace transform in general
- [ ] It never holds for the Laplace transform
- [x] It holds only when the signal is periodic
- [ ] It depends on the sampling rate alone

## True or false: statement 23 about a linear system holds. {type=truefalse id=b23 points=1}

```answer
value: true
```

## How sure are you of your answers so far? {type=scale id=b24}

```answer
min: 1
max: 5
labels:
  1: Not at all
  5: Very sure
```

## Which statement about convolution is correct? {type=single id=b25 points=1}

- [ ] It holds for convolution in general
- [x] It never holds for convolution
- [ ] It holds only when the signal is periodic
- [ ] It depends on the sampling rate alone

## Which statement about a Fourier series is correct? {type=single id=b26 points=1}

- [ ] It holds for a Fourier series in general
- [ ] It never holds for a Fourier series
- [x] It holds only when the signal is periodic
- [ ] It depends on the sampling rate alone

## Explain why sampling below the Nyquist rate causes aliasing. {type=essay id=b27 points=4}

```answer
max_words: 120
rubric:
  mode: additive
  criteria:
    - States fs ≥ 2·fmax (1 pts)
    - Explains that spectral copies overlap (2 pts)
    - Gives a worked example (1 pts)
```

## Which statement about a causal system is correct? {type=single id=b28 points=1}

- [x] It holds for a causal system in general
- [ ] It never holds for a causal system
- [ ] It holds only when the signal is periodic
- [ ] It depends on the sampling rate alone

## Which statement about sampling is correct? {type=single id=b29 points=1}

- [ ] It holds for sampling in general
- [x] It never holds for sampling
- [ ] It holds only when the signal is periodic
- [ ] It depends on the sampling rate alone

## True or false: statement 30 about a linear system holds. {type=truefalse id=b30 points=1}

```answer
value: true
```
