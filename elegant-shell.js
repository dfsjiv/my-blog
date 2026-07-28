(function () {
  const shell = document.getElementById('elegantShell');
  const toggle = document.getElementById('elegantMenuToggle');
  const menu = document.getElementById('elegantNavMenu');
  if (!shell || !toggle || !menu) return;

  function setMenuOpen(open) {
    menu.classList.toggle('is-open', Boolean(open));
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? '关闭导航菜单' : '打开导航菜单');
  }

  toggle.addEventListener('click', function () {
    setMenuOpen(!menu.classList.contains('is-open'));
  });

  window.addEventListener('resize', function () {
    if (window.innerWidth > 900) setMenuOpen(false);
  });

  window.elegantShell = {
    closeNavigation: function () {
      setMenuOpen(false);
      shell.querySelectorAll('.elegant-nav-group[open]').forEach(function (group) {
        group.removeAttribute('open');
      });
    },
  };
}());
