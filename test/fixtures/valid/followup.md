---
title: Follow-up fixture
id: followup
---

# Choices with details

## What is the capital of France? {type=single id=capital}

- [ ] Lyon
- [x] Paris {input="Why Paris?"}
- [ ] Something else {input}

## Select the primes {type=multi id=primes}

- [x] 2
- [x] 3 {input="Name another"}
- [ ] 4

## Where do you study? {type=single id=where graded=false shuffle=true}

- [ ] Home
- [ ] Library
- [ ] Other {input="Where?"}
- [ ] Cafe
- [ ] Lab {input="Which lab?"}

## Do you like quizzes? {type=single id=plain graded=false}

- [ ] Yes
- [ ] No
- [ ] Not sure
