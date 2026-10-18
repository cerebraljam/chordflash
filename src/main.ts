import { mount } from 'svelte';
import App from './App.svelte';
// Fonts are bundled (no requests to a font CDN; works offline). Latin subsets cover French too.
import '@fontsource-variable/bricolage-grotesque/opsz.css';
import '@fontsource/figtree/latin-400.css';
import '@fontsource/figtree/latin-600.css';
import '@fontsource/figtree/latin-700.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import './app.css';

mount(App, { target: document.getElementById('app')! });
