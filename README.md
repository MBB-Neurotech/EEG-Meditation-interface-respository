# Running the app
If not done already, follow the instructions here to download the code: [EEG Meditation Team Guide](https://docs.google.com/document/d/1osU8i9ZI_V6nUZUVps4638OfmPaFP3pMxIYc97aGRQE/edit?tab=t.0)

Next, in the VS Code terminal (If not open, select Terminal in the top bar on a Mac, and select New Terminal) type this command: npm install
- This command will download and install all of the libraries that the code depends on (If already done previously, re-entering the command will simply verify that the libraries are installed correctly and up-to-date)

Finally, enter this command: npm run dev
- This command will produce a localhost link (meaning that it's only accessible on your computer) that will run the app

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
