# 📡 JEV API 참조 명세서 (API Reference)

모든 API는 L7 API 게이트웨이(`http://localhost:3000`)를 통해 단일 진입점으로 라우팅되며, **[단일 통합 Swagger 문서](http://localhost:3000/docs)**에서 대화형 테스트가 가능합니다.

---

## 1. 자원 요청 및 승인 API (Resource Requests & Approval)

개발팀의 자원 신청 및 인프라팀의 심사/프로비저닝을 관리하는 엔드포인트입니다.

### 1) 자원 요청 목록 조회
- **Method / Path**: `GET /api/infra/requests`
- **Query Parameters**:
  - `status`: 필터링할 상태 (`PENDING`, `APPROVED`, `REJECTED`, `PROVISIONED`)
  - `requester`: 신청자 이름 또는 부서명 부분 검색
- **Response (200 OK)**:
  ```json
  [
    {
      "id": "REQ-1001",
      "title": "결제 MSA 성능 부하 테스트용 QEMU VM 신규 발급 요청",
      "requesterName": "김개발",
      "department": "페이먼트개발팀",
      "type": "CREATE_VM",
      "reason": "신규 PG사 연동 성능 부하 테스트를 위한 독립 스테이징 환경 필요",
      "spec": {
        "name": "payment-perf-worker",
        "type": "qemu",
        "cores": 4,
        "memory": 8192,
        "disk": 50
      },
      "status": "PENDING",
      "createdAt": "2026-09-24T04:32:18.710Z",
      "updatedAt": "2026-09-24T04:32:18.710Z"
    }
  ]
  ```

### 2) 큐 통계 요약 조회
- **Method / Path**: `GET /api/infra/requests/stats`
- **Response (200 OK)**:
  ```json
  {
    "total": 5,
    "pending": 2,
    "approved": 3,
    "rejected": 0
  }
  ```

### 3) 신규 자원 요청서 제출 (개발팀)
- **Method / Path**: `POST /api/infra/requests`
- **Request Body**:
  ```json
  {
    "title": "검색엔진 Elastic 인덱서 노드 요청",
    "requesterName": "김개발",
    "department": "검색개발팀",
    "type": "CREATE_VM",
    "reason": "검색 색인 클러스터 성능 향상 목적",
    "spec": {
      "name": "elastic-worker-01",
      "cores": 4,
      "memory": 8192,
      "disk": 50,
      "type": "qemu"
    }
  }
  ```
- **Response (201 Created)**: 발급된 `ResourceRequestDto` (`id: "REQ-XXXX"`, `status: "PENDING"`)

### 4) 자원 요청 심사 및 자동 프로비저닝 (인프라팀)
- **Method / Path**: `POST /api/infra/requests/:id/review`
- **Request Body**:
  ```json
  {
    "decision": "APPROVE",
    "reviewerName": "최인프라팀장",
    "reviewComment": "클러스터 잔여 용량 확인 후 승인",
    "targetNode": "pve-node-01"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "id": "REQ-1001",
    "status": "PROVISIONED",
    "reviewerName": "최인프라팀장",
    "reviewerComment": "클러스터 잔여 용량 확인 후 승인",
    "provisionedVmid": 104,
    "targetNode": "pve-node-01",
    "upid": "UPID:pve-node-01:00001A30:00000000:1718000000:qmcreate:104:root@pam:"
  }
  ```

---

## 2. AI 챗봇 및 실시간 SSE 스트리밍 (Chatbot & Agent)

### 1) 실시간 대화 스트리밍
- **Method / Path**: `POST /api/chat/stream`
- **Content-Type**: `application/json`
- **Accept**: `text/event-stream`
- **Request Body**:
  ```json
  {
    "message": "2코어 4기가 램 20GB 디스크로 결제 모듈 테스트용 가상머신 하나 만들어줘",
    "threadId": "main-thread",
    "role": "DEV_TEAM",
    "requesterName": "김개발"
  }
  ```
- **Server-Sent Events (SSE) 청크 규격**:
  - `type: "thought"`: AI의 초기 분석 사고 과정
  - `type: "decision"`: 도구 선택, 선택 이유(`why`), 안전성 평가(`safetyEvaluation`), 바인딩된 파라미터(`args`), 추론 지연시간(`latencyMs`)
  - `type: "tool_start"` / `type: "tool_end"`: 툴 실행 시작 및 완료 결과
  - `type: "confirmation_required"`: 파괴적 작업 감지 시 발급된 승인 토큰(`token`) 및 대상 VMID 정보
  - `type: "content"`: 최종 사용자 응답 마크다운
  - `type: "done"`: 스트림 종료

### 2) 파괴적 작업 보안 승인 제출
- **Method / Path**: `POST /api/chat/confirm`
- **Request Body**:
  ```json
  {
    "token": "cf_a1b2c3d4e5f67890",
    "approved": true
  }
  ```

---

## 3. 인프라 클러스터 관리 API (Infrastructure Management)

- `GET /api/infra/summary`: 전체 클러스터 요약 (노드, VM, 스토리지, 전체 리소스 사용률)
- `GET /api/infra/nodes`: 클러스터 물리 노드 목록
- `GET /api/infra/vms`: 전체 QEMU 가상머신 및 LXC 컨테이너 목록
- `GET /api/infra/storage`: 스토리지 풀 및 볼륨 사용량
- `GET /api/infra/tasks`: 최근 클러스터 백그라운드 태스크
- `POST /api/infra/action`: 수동 VM 전원 제어 (`start`, `stop`, `reboot`, `force_stop`, `delete`)
- `POST /api/infra/create`: QEMU/LXC 수동 생성
- `POST /api/infra/resize`: VM 가상 디스크 용량 확장

---

## 4. 자동화 및 감사 로그 API (Automation & Audit)

- `GET /api/automation/rules`: 자율 복구 및 모니터링 규칙 목록
- `PATCH /api/automation/rules/:id/toggle`: 자동화 규칙 활성화/비활성화
- `GET /api/audit/logs`: 인프라 변경 및 액터 실행 감사 로그
- `GET /api/audit/decisions`: AI 에이전트의 의사결정 추적 로그 (Reasoning Trace)
