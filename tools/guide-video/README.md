# 사용설명 영상 만들기 (선택, 개발자용)

`public/videos/user-guide.mp4`는 아래 두 스크립트로 만든 **자동 조작 화면 녹화**입니다. 사람이 직접 조작한 녹화가 아닙니다. 홈페이지를 쓰는 데에는 필요하지 않습니다.

1. 터미널 A에서 `npm start`로 로컬 미리보기(http://127.0.0.1:4173)를 엽니다. 인터넷은 필요하지 않습니다.
2. 터미널 B에서 장면을 저장합니다. `node tools/guide-video/tour.mjs <프레임을 저장할 새 폴더>`
   - 이 PC의 Microsoft Edge(헤드리스)로 페이지를 천천히 조작하며 화면, 마우스 커서, 하단 자막을 저장합니다. 자막 문장과 대기 시간은 `tour.mjs`의 단계에서 고칩니다.
3. 프레임을 MP4로 합칩니다. `node tools/guide-video/encode.mjs <프레임 폴더> <결과.mp4>`
   - 같은 Edge의 MediaRecorder로 합치며 실제 길이만큼 시간이 걸립니다(약 5분).

Windows와 Edge 경로(`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`)를 가정합니다. 다른 환경에서는 두 파일 위쪽의 경로를 바꾸세요. 음성은 사용자가 직접 낭독해 녹음한 파일(`내_녹음\NN.m4a`)을 `mux-guide.mjs`로 결합했습니다. 녹음 원본은 저장소에 올리지 않았습니다.

## 음성 넣기 (선택)

4. `node tools/guide-video/make-script.mjs <프레임 폴더>`로 장면 시각(`caps.json`)에 맞춘 낭독 대본 블록(`낭독_블록.json`·`낭독_대본.md`·`낭독_대본.html`)을 만듭니다. 이 파일들은 스크립트를 실행한 폴더에 저장됩니다.
5. 블록별로 읽어 `내_녹음\01.m4a`~`14.m4a`로 저장하고, `node tools/guide-video/mux-guide.mjs <프레임 폴더> <결과.mp4>`로 결합합니다. 녹음이 장면보다 길면 그 블록의 마지막 화면을 늘려 맞춥니다.
