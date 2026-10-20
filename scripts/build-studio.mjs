import { readFile, writeFile } from 'node:fs/promises';
const file = name => readFile(`web/${name}`, 'utf8');
const html = `<!doctype html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Transcribe audios y videos, organiza PDF y vectoriza imágenes. Re-SAPO: dale un repaso, dale forma a tus ideas.">
<title>Re-SAPO · Dale forma a tus ideas</title><link rel="icon" href="/static/logo.svg" type="image/svg+xml">
<link rel="stylesheet" href="/static/styles.css"><link rel="stylesheet" href="/static/studio.css"><link rel="stylesheet" href="/static/intro.css"></head>
<body><a class="skip" href="#intro">Saltar a la introducción</a><header class="header"><a class="brand" href="/"><span class="brand-logo">${await file('logo.svg')}</span><span>Re-SAPO<small>EL ESTUDIO DE TUS IDEAS</small></span></a><nav><a href="/transcribir">Ingresar al estudio →</a><span class="beta"><span></span>Sin registro</span></nav></header>
<main id="intro"><section class="intro-static-hero"><div>${await file('intro-copy.html')}<a class="primary intro-cta" href="/transcribir">Ingresar al estudio <span>→</span></a><p class="intro-access-note">Empieza gratis. Sin correo, contraseña ni tarjeta.</p></div>${await file('intro-art.html')}</section>${await file('intro-details.html')}<a class="primary intro-cta" href="/transcribir">Ingresar al estudio <span>→</span></a><p class="intro-access-note">Tu siguiente idea empieza aquí.</p></main>
<footer class="studio-footer"><div><strong>Re-SAPO</strong><br>Dale un repaso. Dale forma a tus ideas.</div><span>Edición gratuita · Sin registro<br>Hecho para dar el siguiente salto.</span></footer></body></html>`;
await writeFile('web/landing.html', html);
console.log('Portada del estudio generada.');
