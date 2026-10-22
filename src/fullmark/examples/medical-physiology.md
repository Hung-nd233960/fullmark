---
title: "Cardiac physiology: a medical-science quiz"
description: |
  A template for anatomy, physiology and imaging topics. It shows ordering (pathways), matching
  (structure to function), numeric answers with units, labeled fields for calculations, and an essay
  with a rubric. Put figures such as ECG strips or scans in `assets/` and reference them with
  `![alt](assets/name.png)`.
feedback: instant
shuffle_choices: true
pass_mark: 60
tags: [cardiac]
---

# Structure and conduction

Questions on the anatomy and electrical conduction of the heart.

## Which structure is the normal pacemaker of the heart? {id=sa-node tags=conduction}

- [ ] The atrioventricular (AV) node
- [x] The sinoatrial (SA) node
- [ ] The bundle of His
- [ ] The Purkinje fibres

> [!hint]
> It has the fastest spontaneous depolarisation rate.

> [!explanation]
> The SA node depolarises fastest (about 60 to 100 times a minute), so it sets the rhythm. The AV node, bundle of His and Purkinje fibres can pace the heart only if the nodes above them fail, and then at slower rates.

## Put the path of an electrical impulse through the heart in order. {id=pathway type=ordering points=3 tags=conduction}

1. Sinoatrial node
2. Atrioventricular node
3. Bundle of His
4. Left and right bundle branches
5. Purkinje fibres

> [!explanation]
> The impulse spreads across the atria, is delayed in the AV node so the ventricles fill, and then travels down the septum and out to the ventricular muscle.

## Match each ECG wave to the heart event it records. {id=ecg-match type=matching points=3 tags=conduction,ecg}

- P wave :: Atrial depolarisation
- QRS complex :: Ventricular depolarisation
- T wave :: Ventricular repolarisation
- :: Atrial repolarisation

> [!explanation]
> Atrial repolarisation happens during the QRS complex and is hidden by it, which is why it has no wave of its own and works as the distractor.

## The valve between the left atrium and the left ventricle is the [[mitral|bicuspid]] valve. {id=mitral type=blanks tags=anatomy}

> [!explanation]
> It has two cusps, hence "bicuspid". The tricuspid valve sits on the right side.

# Haemodynamics

Calculations. Give units in the answer where the question asks for them.

## A resting heart rate is 72 beats per minute and the stroke volume is 70 mL. What is the cardiac output? {id=co type=numeric points=2 tags=haemodynamics}

```answer
value: 5.04
tolerance: 0.05
unit: L/min
```

> [!hint]
> Cardiac output = heart rate x stroke volume. Convert mL to L at the end.

> [!explanation]
> $72 \times 70 = 5040$ mL/min, which is 5.04 L/min. A common slip is leaving the answer in mL/min.

## On an ECG the R-R interval is 0.8 s. What is the heart rate? {id=hr type=numeric tags=ecg}

```answer
value: 75
tolerance: 1
unit: beats/min
```

> [!explanation]
> $60 / 0.8 = 75$ beats per minute. The interval is the time for one beat, so divide 60 s by it.

## Which of these increase stroke volume? {id=sv type=multi points=2 tags=haemodynamics}

- [x] Greater venous return (preload)
- [x] Stronger myocardial contractility
- [x] Lower arterial resistance (afterload)
- [ ] Higher arterial resistance (afterload)
- [ ] Vagal stimulation of the SA node

> [!explanation]
> More filling stretches the muscle and it ejects more (Frank-Starling), more contractility ejects more, and lower afterload is easier to eject against. Higher afterload lowers stroke volume, and vagal tone mainly slows the rate rather than changing stroke volume directly.

## Mean arterial pressure is roughly the diastolic pressure plus one third of the pulse pressure. {id=map-true type=truefalse tags=haemodynamics}

```answer
value: true
```

> [!explanation]
> The heart spends about two thirds of each cycle in diastole, so the mean pressure sits closer to the diastolic value. MAP = DBP + (SBP - DBP) / 3.

## A patient has a blood pressure of 120/80 mmHg. Work out the pressures. {id=bp-fields type=fields points=2 tags=haemodynamics}

```answer
fields:
  - label: "Pulse pressure (mmHg)"
    value: 40
  - label: "Mean arterial pressure (mmHg, one decimal place)"
    value: 93.3
    tolerance: 0.2
```

> [!explanation]
> Pulse pressure is 120 - 80 = 40 mmHg. MAP is 80 + 40 / 3 = 93.3 mmHg.

# Written answer

## Explain the Frank-Starling mechanism and why it matters. {id=frank-starling type=essay points=4 tags=haemodynamics}

```answer
min_words: 40
max_words: 150
rubric:
  - States that greater end-diastolic filling stretches the fibres and increases the force of contraction
  - Links this to a larger stroke volume for the same heart rate
  - Gives a clinical or physiological consequence, for example balancing left and right output or the effect of reduced venous return
  - Uses correct terms such as preload, end-diastolic volume and stroke volume
```
