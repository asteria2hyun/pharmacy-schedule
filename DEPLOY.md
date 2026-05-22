# GitHub Pages 배포 방법

이 폴더는 정적 웹앱이라 GitHub Pages에 그대로 올릴 수 있습니다.

## 빠른 배포

1. GitHub에서 새 저장소를 만듭니다.
   - 예: `pharmacy-schedule`
   - 공개 저장소이면 무료 GitHub Pages 사용이 쉽습니다.
2. 저장소 화면에서 `Add file` > `Upload files`를 누릅니다.
3. 이 폴더의 `release` 안에 있는 파일을 모두 업로드합니다.
   - `index.html`
   - `app.js`
   - `styles.css`
   - `README.md`
   - `.nojekyll`
4. `Commit changes`를 누릅니다.
5. 저장소 `Settings` > `Pages`로 이동합니다.
6. `Build and deployment`에서 `Deploy from a branch`를 선택합니다.
7. Branch는 `main`, Folder는 `/root`로 선택하고 저장합니다.
8. 잠시 후 표시되는 Pages 주소를 직원들에게 공유합니다.

## 중요한 주의

현재 버전은 서버 없이 각 휴대폰 브라우저 저장공간에 데이터가 저장됩니다.

따라서 GitHub Pages에 올리면 접속 링크는 공유할 수 있지만, 직원들이 같은 데이터를 실시간으로 공유하는 운영 방식은 아직 아닙니다. 실제 운영용으로 쓰려면 Supabase 같은 서버 데이터베이스와 인증을 연결해야 합니다.

또한 정적 앱 파일은 브라우저에서 내려받는 구조라, 민감한 급여/계정 정보를 앱 코드 안에 직접 넣는 방식은 장기 운영용 보안 구조로 적합하지 않습니다.
