package kr.co.ganpanda.app

import android.os.Bundle
import android.view.View
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

// 간판다 (2026-10-25): targetSdk 36 부터는 앱이 상태 막대·내비 막대 밑까지 그리는 것이 강제되고(끄는 설정 무시),
// 웹뷰는 안전 영역 값을 주지 않아 상단 막대가 시계와 겹쳤다 → 시스템 막대·키보드 높이만큼 안쪽 여백을 직접 준다 (막대 뒤는 테마의 windowBackground 색)
class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { v, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
      v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      // 다 썼다고 알린다 — 안 그러면 웹뷰가 카메라 구멍(컷아웃) 여백을 env(safe-area-inset-*) 로 한 번 더 더해 띠가 생긴다 (갤럭시 Z 폴드, 2026-10-25)
      WindowInsetsCompat.CONSUMED
    }
  }
}
