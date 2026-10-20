# 사용설명 영상 만들기 (선택, 개발자용)

`public/videos/user-guide.mp4`는 아래 두 스크립트로 만든 **자동 조작 화면 녹화**입니다. 사람이 직접 조작한 녹화가 아닙니다. 홈페이지를 쓰는 데에는 필요하지 않습니다.

1. 터미널 A에서 `npm start`로 로컬 미리보기(http://127.0.0.1:4173)를 엽니다. 인터넷은 필요하지 않습니다.
2. 터미널 B에서 장면을 저장합니다. `node tools/guide-video/tour.mjs <프레임을 저장할 새 폴더>`
   - 이 PC의 Microsoft Edge(헤드리스)로 페이지를 천천히 조작하며 화면, 마우스 커서, 하단 자막을 저장합니다. 자막 문장과 대기 시간은 `tour.mjs`의 단계에서 고칩니다.
3. 프레임을 MP4로 합칩니다. `node tools/guide-video/encode.mjs <프레임 폴더> <결과.mp4>`
   - 같은 Edge의 MediaRecorder로 합치며 실제 길이만큼 시간이 걸립니다(약 5분).

Windows와 Edge 경로(`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`)를 가정합니다. 다른 환경에서는 두 파일 위쪽의 경로를 바꾸세요. 음성은 없습니다.
