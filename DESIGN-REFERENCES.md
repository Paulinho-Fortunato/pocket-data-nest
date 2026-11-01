# Referências do redesign glassmorphism

A direção visual combina o tema escuro/dourado existente do AngoStudy com superfícies translúcidas, blur controlado, bordas de luz e sombras suaves.

- [Nielsen Norman Group — Glassmorphism: Definition and Best Practices](https://www.nngroup.com/articles/glassmorphism/): recomenda usar glassmorphism para hierarquia e profundidade, controlar opacidade/blur e privilegiar contraste e uso parcimonioso.
- [That Software Dude — How to Implement Glassmorphism Design on Your Website](https://www.thatsoftwaredude.com/content/14160/how-to-implement-glassmorphism-design-on-your-website): sintetiza a receita CSS em transparência, `backdrop-filter`, borda subtil, sombra suave e fallback quando blur não estiver disponível.

Decisões aplicadas:

- Preservar o dourado como cor de marca e adicionar halos frios muito discretos ao fundo.
- Aplicar glass a painéis, topbar, composer e tabbar, não a cada elemento individual.
- Reforçar bordas e opacidade das superfícies para manter leitura em dark mode.
- Usar `backdrop-filter` com fallback de background e `contain` na navegação mobile.
