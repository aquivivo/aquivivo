// assets/js/pages/minitest-page.js
const qs = new URLSearchParams(window.location.search || '');

function navHref(base) {
  const p = new URLSearchParams(window.location.search || '');
  p.delete('mode');
  const q = p.toString();
  return `${base}${q ? `?${q}` : ''}`;
}

const btnBack = document.getElementById('btnMiniBack');
if (btnBack) {
  const level = String(qs.get('level') || '').toUpperCase();
  const id = String(qs.get('id') || '').trim();
  const target = level && id ? navHref('lessonpage.html') : 'course.html?level=A1&course=COURSE_PATH&flow=continuous';
  btnBack.href = target;
}
