# Pressure Valve

영어 표현으로 하루의 스트레스를 짧게 배출하는 인터랙티브 벤팅 웹 앱.
제품개발론(Ulrich & Eppinger 방식) 강의자료를 기준으로 기획→개발을 4개 Phase로 진행한 사이드 프로젝트입니다.

## 파일

- `pressure-valve.html` — 제품 본체. 브라우저에서 그대로 열면 동작하는 단일 HTML 파일(외부 의존성 없음, 서버 불필요).
- `pressure-valve-charter.html` — 기획 문서. Phase 1(기획) ~ Phase 4(시험·양산 준비) 전 과정과 각 phase의 디버깅 로그를 기록.

## 현재 배포 위치

두 파일 모두 Claude Artifact로 게시되어 있고, 이 저장소와 별개로 계속 유지됩니다(세션이 끝나도 사라지지 않음):

- 앱: https://claude.ai/code/artifact/27b81816-0070-4645-89eb-4c564bdc022c
- 기획 문서: https://claude.ai/code/artifact/24077d86-50ea-4bba-aea4-f7799badc7a4

## 이 저장소에 대해

이 git 저장소는 로컬 백업/버전 관리용으로 새로 만들어졌습니다. 이전 phase별 변경 이력(diff)은 별도로 보존되어 있지 않아, 첫 커밋은 Phase 1~4가 모두 반영된 현재 완성 상태 하나로 기록됩니다. 앞으로 이 저장소에 GitHub 원격을 연결하면 이 시점부터의 변경 이력이 정상적으로 쌓입니다.

## 기술 스택

순수 HTML/CSS/JS. 빌드 도구, 프레임워크, 백엔드 없음. `localStorage`로 즐겨찾기·강도 설정을 브라우저에만 저장하고 서버로 아무것도 전송하지 않습니다.
