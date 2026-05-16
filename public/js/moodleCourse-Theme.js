// moodleCourse-Theme.js - Sistema de cambio de tema claro/oscuro

// Estado del tema
let currentTheme = localStorage.getItem('theme') || 'light';

// Función para alternar tema
function toggleTheme() {
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  applyTheme(newTheme);
}

// Función para aplicar el tema
function applyTheme(theme) {
  // Cambiar la clase en el body
  if (theme === 'dark') {
    document.body.classList.add('dark');
  } else {
    document.body.classList.remove('dark');
  }
  
  // Actualizar iconos del botón de tema
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    const sunIcon = themeToggle.querySelector('.fa-sun');
    const moonIcon = themeToggle.querySelector('.fa-moon');
    
    if (theme === 'dark') {
      if (sunIcon) sunIcon.classList.add('hidden');
      if (moonIcon) moonIcon.classList.remove('hidden');
    } else {
      if (sunIcon) sunIcon.classList.remove('hidden');
      if (moonIcon) moonIcon.classList.add('hidden');
    }
  }
  
  // Guardar preferencia
  localStorage.setItem('theme', theme);
  currentTheme = theme;
  
  // Disparar evento personalizado
  window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme } }));
  
  // Forzar actualización de algunos elementos dinámicos
  updateDynamicElements(theme);
}

// Función para actualizar elementos dinámicos que no se actualizan automáticamente
function updateDynamicElements(theme) {
  // Esperar un frame para que el DOM se actualice
  setTimeout(() => {
    // Actualizar íconos en los cursos (si están renderizados)
    document.querySelectorAll('.curso-item .fas').forEach(icon => {
      // Los íconos ya deberían cambiar automáticamente por CSS, pero por si acaso
      if (theme === 'dark') {
        icon.classList.remove('text-blue-500', 'text-red-500', 'text-green-600');
        icon.classList.add('dark:text-blue-500', 'dark:text-red-500', 'dark:text-green-600');
      } else {
        icon.classList.remove('dark:text-blue-500', 'dark:text-red-500', 'dark:text-green-600');
        icon.classList.add('text-blue-500', 'text-red-500', 'text-green-600');
      }
    });
    
    // Actualizar modales abiertos
    const openModals = document.querySelectorAll('.modal:not(.hidden)');
    openModals.forEach(modal => {
      // Forzar re-render si es necesario
      modal.classList.add('theme-transition');
      setTimeout(() => modal.classList.remove('theme-transition'), 100);
    });
  }, 50);
}

// Función para inicializar el tema
function initTheme() {
  // Aplicar tema guardado o preferencia del sistema
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  if (savedTheme) {
    applyTheme(savedTheme);
  } else if (prefersDark) {
    applyTheme('dark');
  } else {
    applyTheme('light');
  }
  
  // Agregar evento al botón de cambio de tema
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
    
    // También agregar atajo de teclado (Ctrl+Shift+T)
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        toggleTheme();
      }
    });
  }
  
  // Escuchar cambios en la preferencia del sistema
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) { // Solo si el usuario no ha elegido manualmente
      applyTheme(e.matches ? 'dark' : 'light');
    }
  });
}

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTheme);
} else {
  initTheme();
}

// Exportar funciones para uso externo
export { toggleTheme, applyTheme, currentTheme };

// También exportar una función para forzar actualización si hay problemas
export function forceThemeRefresh() {
  applyTheme(currentTheme);
}