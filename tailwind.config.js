/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // Montserrat é a voz da app: números, botões, listas. Playfair Display
        // assina os títulos — é a diferença entre uma app de mobilidade e uma
        // app de mobilidade com marca.
        sans: ['Montserrat', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'Times New Roman', 'serif'],
      },
      // A paleta vem do quadro «Elara Trajectoria — App UI». Os nomes ficam
      // (zinc/purple/amber/red) para não reescrever 14 mil linhas, mas os
      // valores mudam: neutros de ameixa e creme, roxo violeta e ouro champanhe.
      colors: {
        zinc: {
          // Claro: papel creme. Escuro: ameixa, do painel (#2A1254) ao fundo
          // mais fundo (#1B0B38). O mesmo token serve os dois temas porque a
          // app troca de tema pela classe `.dark`, não pelos nomes.
          50: '#FAF7F0',
          100: '#F5F1E9',
          150: '#EFE9DF',
          200: '#E6DDF5',
          250: '#D9CFEE',
          300: '#C9BBE4',
          400: '#A392C4',
          500: '#6B5A8A',
          600: '#4E3B72',
          700: '#3A2A5C',
          800: '#2A1254',
          900: '#241146',
          950: '#1B0B38',
        },
        purple: {
          50: '#F7F3FE',
          100: '#F1EBFD',
          200: '#E3D8FA',
          300: '#C9B4F3',
          400: '#A98FEA',
          500: '#7C5CE6',
          600: '#5A2FC2',
          700: '#4B27A4',
          800: '#3A1C80',
          900: '#2A1254',
          950: '#1B0B38',
        },
        amber: {
          50: '#FDF9F0',
          100: '#FBF1DE',
          200: '#F6E4C4',
          300: '#EFD5A9',
          400: '#E7CFA6',
          500: '#D9B47C',
          600: '#C89B68',
          700: '#A87B4A',
          800: '#7C5734',
          900: '#513A23',
          950: '#2E2014',
        },
        red: {
          50: '#FDF2F4',
          100: '#FBE3E8',
          200: '#F6C9D2',
          300: '#EEA6B6',
          400: '#E17C93',
          500: '#D25571',
          600: '#B4234A',
          700: '#961C3E',
          800: '#7A1833',
          900: '#5C1227',
          950: '#370A18',
        },
        // Nomes próprios para o que é da marca e não deve variar com o tema.
        ink: '#2A1250',
        vault: '#2A1254',
        night: '#1B0B38',
        cream: '#FAF7F0',
      },
      // Escala de tipo com entrelinha e perseguição por tamanho: texto pequeno
      // respira (tracking 0), texto grande aperta (-0.02em). Peso e corpo
      // fazem a ênfase; maiúsculas e `font-black` não fazem.
      fontSize: {
        caption: ['11px', { lineHeight: '13px', letterSpacing: '0.01em' }],
        label: ['12px', { lineHeight: '15px', letterSpacing: '0' }],
        body: ['14px', { lineHeight: '19px', letterSpacing: '-0.005em' }],
        control: ['16px', { lineHeight: '19px', letterSpacing: '-0.005em' }],
        lead: ['20px', { lineHeight: '23px', letterSpacing: '-0.01em' }],
        stat: ['22px', { lineHeight: '26px', letterSpacing: '-0.015em' }],
        title: ['24px', { lineHeight: '27px', letterSpacing: '-0.015em' }],
        hero: ['28px', { lineHeight: '32px', letterSpacing: '-0.015em' }],
        display: ['32px', { lineHeight: '35px', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        control: '14px',
        card: '20px',
        sheet: '28px',
        // Os cartões do referencial têm 20 px e os painéis 28 px. `2xl` e
        // `3xl` já são usados em todo o lado; mudar aqui é mudar a app inteira
        // sem tocar em 400 ficheiros.
        '2xl': '20px',
        '3xl': '28px',
      },
      boxShadow: {
        hair: '0 1px 2px rgba(27, 11, 56, 0.08)',
        float: '0 6px 18px -8px rgba(27, 11, 56, 0.35)',
        sheet: '0 -10px 40px -12px rgba(15, 6, 36, 0.55)',
        card: '0 10px 30px -14px rgba(27, 11, 56, 0.45)',
        // O único brilho de cor que fica: o ouro da acção primária.
        action: '0 10px 24px -12px rgba(200, 155, 104, 0.65)',
      },
    },
  },
  plugins: [],
}
