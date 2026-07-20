# F1 AI Second Screen

> **Product Requirements Document (PRD)**  
> **Part 1 — Vision & Product Definition**

**Version:** 1.0 (Draft)  
**Author:** Project Owner + OpenAI  
**Status:** In Progress

---

# 1. Executive Summary

## 1.1 Vision

F1 AI Second Screen은 Formula 1 팬들이 **경기를 더 깊이 이해할 수 있도록 돕는 AI 기반 실시간 Companion 서비스**이다.

이 서비스는 경기 영상을 제공하지 않는다.

대신 TV, F1 TV, 쿠팡플레이 등 기존 중계를 시청하는 동안 함께 사용하는 **Second Screen Experience**를 제공한다.

서비스는 OpenF1의 실시간 데이터를 수집하여 경기 상태를 분석하고, AI가 이를 자연스럽게 설명하며 사용자의 질문에 답변한다.

---

## 1.2 Mission

모든 Formula 1 팬이 전략과 레이스를 쉽게 이해할 수 있도록 만든다.

초보자는 다음과 같은 질문에 대한 답을 쉽게 얻을 수 있어야 한다.

> "왜 지금 피트에 안 들어가?"

숙련자는 다음과 같은 전략적 상황을 빠르게 이해할 수 있어야 한다.

> "언더컷 가능성이 생겼네."

---

## 1.3 Product Statement

> **An AI-powered second-screen companion that explains Formula 1 races in real time.**

---

# 2. Problem Statement

Formula 1은 세계에서 가장 복잡한 스포츠 중 하나이다.

경기 중에는 동시에 수십 가지 정보가 발생한다.

예를 들어 다음과 같은 정보가 실시간으로 변한다.

- Gap
- Delta
- Tire
- Overtake Mode
- ERS
- Pit Window
- Strategy
- Race Control
- Yellow Flag
- Safety Car
- Virtual Safety Car

공식 타이밍 화면은 이러한 데이터를 숫자로 제공하지만, **왜 중요한지**는 설명하지 않는다.

입문자는 물론 일반 팬도 현재 무슨 일이 일어나고 있는지 이해하기 어렵다.

## Current Experience

현재 사용자는 여러 서비스를 동시에 사용한다.

- TV 중계
- F1 TV
- Live Timing
- Reddit
- X(Twitter)

즉, 경기를 제대로 이해하려면 여러 서비스를 오가야 한다.

## Pain Points

### 2.1 Too Much Data

공식 타이밍은 데이터를 제공하지만,

**그 데이터의 의미는 설명하지 않는다.**

---

### 2.2 Strategy is Hidden

경기의 승패는 전략에서 결정되는 경우가 많다.

하지만 대부분의 팬은 다음 개념을 직관적으로 이해하기 어렵다.

- 언더컷
- 오버컷
- Tire Offset
- Track Position

---

### 2.3 Commentary is Generic

중계 해설은 모든 드라이버를 대상으로 한다.

하지만 사용자는 대부분 자신이 응원하는 드라이버 중심의 정보를 원한다.

---

### 2.4 No Interactive Experience

현재 중계를 보면서 자연스럽게 질문할 수 있는 방법이 없다.

예를 들어,

- 왜 지금 피트에 안 들어갔어?
- 누가 가장 유리한 전략이야?
- 세이프티카로 누가 이득을 봤어?

와 같은 질문에 즉시 답해주는 서비스가 부족하다.

---

# 3. Opportunity

최근 AI 기술의 발전으로 경기 데이터를 자연어로 설명하는 것이 가능해졌다.

Formula 1은

- 구조화된 데이터
- 명확한 이벤트
- 전략 중심 스포츠

라는 특징을 가지고 있어 AI와 매우 잘 맞는다.

## Why Now?

### AI

LLM은 경기 데이터를 이해하기 쉬운 자연어로 설명할 수 있을 만큼 발전했다.

---

### Open Data

OpenF1을 통해 실시간 데이터를 활용할 수 있다.

---

### Mobile Usage

대부분의 팬은 경기를 시청하면서 동시에 스마트폰을 사용한다.

Second Screen 사용 패턴은 이미 자연스럽게 자리 잡고 있다.

---

### Personalization

AI는 사용자가 선택한 드라이버만 집중적으로 설명할 수 있다.

이는 기존 중계가 제공하지 못하는 개인화 경험이다.

---

# 4. Product Goals

## Goal 1 — 실시간 경기 이해도 향상

사용자는 현재 경기 상황을 **3초 이내에 이해**할 수 있어야 한다.

---

## Goal 2 — AI 질문 경험

사용자는 자연어로 질문할 수 있어야 한다.

예시

- Why didn't Norris pit?
- 지금 누가 가장 빠르지?
- ベルスタッペンは追いつけそう？

---

## Goal 3 — Favorite Driver Experience

서비스는 사용자가 응원하는 드라이버를 중심으로 경기를 설명해야 한다.

---

## Goal 4 — Global Product

서비스는 처음부터 다국어를 지원한다.

지원 언어

- English
- 한국어
- 日本語

---

## Goal 5 — Low Cost Infrastructure

MVP는 운영비를 최소화해야 한다.

목표

- 경기 없는 날에는 비용이 거의 발생하지 않을 것
- 경기 중에도 비용을 효율적으로 유지할 것

---

# 5. Target Users

## Persona A — New Fan

### 특징

- 20~35세
- Drive to Survive를 통해 F1에 입문
- 경기 규칙과 전략을 잘 모름

### 원하는 기능

- 쉬운 설명
- AI 질문
- 전략 해설

---

## Persona B — Casual Fan

### 특징

- 매주 경기를 시청
- 기본 규칙은 이해하지만 전략은 어려움

### 원하는 기능

- 현재 상황 요약
- 관심 드라이버 중심 정보
- 실시간 해설

---

## Persona C — Hardcore Fan

### 특징

- Live Timing을 자주 사용
- 전략과 데이터 분석을 즐김

### 원하는 기능

- Tire Strategy
- Gap Analysis
- Race Pace
- AI 전략 분석

---

# 6. User Journey

## Before Race

1. 사용자가 앱을 실행한다.
2. 오늘의 세션을 선택한다.
3. 관심 드라이버를 선택한다.
4. AI가 오늘 경기의 주요 포인트를 요약해준다.

---

## During Race

1. 경기 시작
2. 실시간 데이터 수신
3. 이벤트 감지
4. AI 해설 생성
5. 사용자 질문
6. AI 답변
7. 관심 드라이버 중심 정보 제공

---

## After Race

AI가 다음 내용을 자동으로 요약한다.

- 승부처
- 전략
- 주요 추월
- 베스트 드라이버

사용자는 경기 종료 후에도 언제든지 요약을 다시 확인할 수 있다.

---

## Next

다음 문서에서는 다음 내용을 정의한다.

- Core Features
- MVP Scope
- Future Scope
- AI Philosophy
- Non Goals
- Success Metrics
- UX Principles
- Product Principles

# 7. Core Features

본 서비스는 "AI가 실시간 Formula 1 경기를 이해하기 쉽게 설명하는 Second Screen"을 목표로 한다.

MVP에서는 사용자가 경기를 시청하는 동안 필요한 핵심 기능에 집중한다.

---

## 7.1 Live Race Dashboard

### Description

현재 경기 상황을 한눈에 보여주는 메인 화면이다.

서비스의 중심이 되는 화면이며, 대부분의 사용자는 경기 내내 이 화면을 유지하게 된다.

### Included Information

- Grand Prix 이름
- Circuit
- 현재 세션
- 현재 Lap
- 총 Lap
- Green / Yellow / Safety Car / VSC / Red Flag
- 마지막 데이터 업데이트 시간

---

### Driver Table

드라이버별

- Position
- Driver
- Team
- Gap
- Interval
- Tire Compound
- Tire Age
- Last Lap
- Pit Count
- Position Change

를 표시한다.

---

### Design Goal

공식 Live Timing보다 이해하기 쉬워야 한다.

---

## 7.2 Favorite Driver

사용자는 하나 이상의 관심 드라이버를 선택할 수 있다.

MVP에서는 한 명만 선택한다.

### Why

대부분의 팬은

자신이 응원하는 드라이버를 중심으로 경기를 본다.

---

### Favorite Driver Card

선택한 드라이버에 대해

- Current Position
- Starting Position
- Gap Ahead
- Gap Behind
- Tire
- Tire Age
- Recent Pace
- Pit History
- Recent Events

를 표시한다.

---

### Future

향후

여러 명의 드라이버 선택을 지원한다.

---

## 7.3 Event Feed

실시간 이벤트 피드

Worker가 감지한 이벤트를

시간순으로 표시한다.

예시

- Norris entered the pits.
- Verstappen is within 1s of Norris — overtake mode available.
- Safety Car deployed.
- Russell set the fastest lap.
- Leclerc gained two positions.

---

### Priority

Critical

- Red Flag
- Safety Car

High

- Pit Stop
- Overtake
- Strategy Change

Medium

- Fastest Lap
- Overtake Mode

Low

- Personal Best
- Minor Gap Changes

---

### Goal

사용자는 피드만 봐도

경기 흐름을 이해할 수 있어야 한다.

---

# 8. AI Features

AI는 서비스의 핵심 기능이다.

하지만

AI는 경기 데이터를 계산하지 않는다.

Worker가 계산한 데이터를

사람이 이해하기 쉽게 설명하는 역할만 수행한다.

---

## 8.1 Ask AI

사용자는 경기 중 자유롭게 질문할 수 있다.

예시

- Why didn't Norris pit?
- Why is Verstappen losing pace?
- 지금 누가 가장 빠른가?
- 지금 가장 유리한 전략은?
- ベルスタッペンは追いつけそう？

---

### Response Goal

답변은

- 짧고
- 명확하며
- 현재 데이터 기반

이어야 한다.

---

### Bad Example

> Norris will definitely pit next lap.

---

### Good Example

> Based on the current tyre age and gap, a pit stop is possible, but the team's actual strategy cannot be confirmed from the available data.

---

## 8.2 AI Commentary

AI는 중요한 이벤트가 발생했을 때만

자동으로 해설을 생성한다.

---

### Example

Safety Car

↓

Worker detects event

↓

LLM generates

↓

"Drivers who have not yet stopped may gain a strategic advantage because the field has compressed."

---

### Goal

AI는

중계 해설을 대체하는 것이 아니라

경기의 의미를 설명한다.

---

## 8.3 Beginner Mode

입문자를 위한 설명

예시

> 오버테이크 모드(매뉴얼 오버라이드)는 앞차와 1초 이내일 때 추격 차량에게 주어지는
> 추가 전기 부스트입니다. 2026 시즌부터 DRS 를 대체했습니다.

---

## 8.4 Expert Mode

숙련자를 위한 설명

예시

> Norris is extending the first stint, likely aiming for an overcut opportunity if the medium tyre degradation remains manageable.

---

# 9. MVP Scope

MVP에서는 반드시 구현한다.

## Must Have

- Live Dashboard
- Driver Table
- Favorite Driver
- Event Feed
- Firebase Authentication
- Firestore
- Mock Mode
- Replay Mode
- OpenF1 Live Mode
- Ask AI
- AI Commentary
- English
- Korean
- Japanese
- Capacitor App

---

## Should Have

- Push Notification
- Race Summary
- Driver Comparison

---

## Could Have

- Apple Watch
- Wear OS
- Widgets
- Dynamic Island
- Live Activities

---

# 10. Non Goals

다음 기능은 MVP에서 구현하지 않는다.

## Video Streaming

서비스는 경기 영상을 제공하지 않는다.

---

## Betting

베팅 기능은 제공하지 않는다.

---

## Fantasy League

Fantasy 기능은 MVP 범위에 포함하지 않는다.

---

## Team Radio

공식 Team Radio를 제공하지 않는다.

---

## Prediction

근거 없는

- 우승 확률
- 사고 확률
- 피트 확률

등은 생성하지 않는다.

AI는 항상

현재 데이터 기반으로만 설명한다.

---

# 11. Product Principles

모든 기능은 다음 원칙을 따른다.

## Principle 1

AI보다 데이터가 우선이다.

---

## Principle 2

실시간성이 가장 중요하다.

---

## Principle 3

설명은 짧고 명확해야 한다.

---

## Principle 4

사용자는

3초 안에

현재 경기 상황을 이해할 수 있어야 한다.

---

## Principle 5

운영비는 항상 최소화한다.

---

## Principle 6

모바일 경험을 가장 우선한다.

---

## Principle 7

모든 기능은

관심 드라이버 중심으로 동작해야 한다.

# 12. Success Metrics

서비스의 성공 여부는 단순한 다운로드 수가 아니라 실제 경기 중 사용 패턴을 기준으로 판단한다.

---

## Product Metrics

### Live Session Retention

경기 시작 후 사용자가 서비스를 계속 켜두는 시간을 측정한다.

목표

- 평균 사용 시간 60분 이상

---

### Ask AI Usage

AI 질문 기능 사용률

목표

- 경기당 평균 3회 이상 질문

---

### Favorite Driver Adoption

관심 드라이버를 선택한 사용자 비율

목표

- 가입 사용자 70% 이상

---

### Session Return Rate

다음 경기에도 다시 방문하는 비율

목표

- 50% 이상

---

### Daily Active Users

레이스가 있는 날의 활성 사용자

지속적으로 증가하는 것이 목표이다.

---

# 13. UX Principles

## 13.1 Second Screen First

서비스는 항상 세컨드 스크린이라는 전제를 가진다.

사용자는 이미 TV 또는 다른 앱으로 중계를 보고 있다.

따라서 서비스는 영상을 대신하지 않는다.

---

## 13.2 Information Before Decoration

화려한 애니메이션보다

정보 전달이 우선이다.

---

## 13.3 Three Second Rule

사용자는 앱을 열고

3초 안에

현재 경기 상황을 이해할 수 있어야 한다.

---

## 13.4 One Hand Experience

모든 주요 기능은

한 손으로 사용할 수 있어야 한다.

---

## 13.5 No Information Overload

한 화면에 너무 많은 정보를 표시하지 않는다.

필요한 경우 Progressive Disclosure를 사용한다.

예시

Driver Card

↓

"더 보기"

↓

세부 데이터 표시

---

# 14. AI Principles

AI는 사람보다 똑똑한 해설자가 아니라

신뢰할 수 있는 Race Engineer를 목표로 한다.

---

## Rule 1

데이터를 절대 만들어내지 않는다.

---

## Rule 2

근거 없는 확률을 생성하지 않는다.

---

## Rule 3

현재 데이터만 설명한다.

---

## Rule 4

팀 전략은 추정이라고 명시한다.

---

## Rule 5

데이터가 부족하면

모른다고 말한다.

---

## Rule 6

답변은 항상 짧고 읽기 쉬워야 한다.

목표

100~200자

---

# 15. Product Constraints

MVP는 다음 제약을 가진다.

---

## Infrastructure

Firebase 기반으로 구축한다.

운영비를 최소화하는 것을 우선한다.

---

## Database

Firestore만 사용한다.

PostgreSQL은 MVP에서 사용하지 않는다.

---

## Authentication

Firebase Authentication 사용

---

## Mobile

Capacitor 기반

---

## AI

OpenAI Provider

Provider는 추후 교체 가능하도록 추상화한다.

---

## Languages

- English
- 한국어
- 日本語

---

# 16. Out of Scope

다음 기능은 MVP 이후에 고려한다.

- Apple Watch
- Android Wear
- Live Activities
- Vision Pro
- Smart TV App
- Driver Voice
- AI Voice Commentary
- Fantasy League
- Community
- Social Feed
- Clip Sharing
- Premium Analytics

---

# 17. Release Strategy

## Phase 1

Internal Prototype

목표

- Mock 데이터
- UI
- Firebase
- Ask AI

---

## Phase 2

Developer Preview

목표

- Replay Mode
- OpenF1 연동
- Event Engine

---

## Phase 3

Closed Beta

목표

- 실제 경기 테스트
- 사용자 피드백

---

## Phase 4

Public Launch

목표

- App Store
- Google Play
- Web

---

# 18. Long-term Vision

이 서비스는 단순한 Live Timing 앱이 아니다.

장기적으로는 AI 기반 Motorsport Assistant를 목표로 한다.

향후 확장 가능성

- Formula 2
- Formula 3
- WEC
- IMSA
- IndyCar
- MotoGP
- WRC

AI는 각 모터스포츠의 데이터를 이해하고

사용자가 질문하면

실시간으로 설명하는 플랫폼으로 발전한다.

---

# 19. Definition of Success

이 프로젝트는 사용자가

> "중계를 볼 때 이 앱을 켜지 않으면 허전하다."

라고 느끼는 순간 성공이다.

서비스는 경기 영상을 대체하지 않는다.

대신,

경기를 **더 재미있고 더 쉽게 이해하도록 만드는 최고의 Second Screen Experience**를 제공하는 것을 목표로 한다.

---

# Document Status

**Document:** `docs/01-product-requirements.md`

**Status:** ✅ Complete

---

# Next Document

`docs/02-architecture.md`

다음 문서에서는 다음 내용을 정의한다.

- 전체 시스템 아키텍처
- Firebase App Hosting
- Cloud Run Worker
- Firestore 설계
- OpenF1 데이터 흐름
- Event Engine
- AI 데이터 흐름
- Firestore 읽기/쓰기 최적화
- 비용 절감 전략
- 실시간 데이터 처리 방식
- Capacitor 앱 구조