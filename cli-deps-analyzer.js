#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

function validateParams(params) {
  const errors = [];

  if (!params['package-name'] || typeof params['package-name'] !== 'string' || !params['package-name'].trim()) {
    errors.push('--package-name обязателен и не может быть пустым.');
  }

  if (!params['repo'] || typeof params['repo'] !== 'string') {
    errors.push('--repo обязателен.');
  }

  const validModes = ['clone', 'use-local', 'download'];
  if (!params['repo-mode'] || !validModes.includes(params['repo-mode'])) {
    errors.push(`--repo-mode должен быть одним из: ${validModes.join(', ')}`);
  }

  if (errors.length > 0) throw new Error(errors.join('\n'));

  return {
    packageName: params['package-name'].trim(),
    repo: params['repo'].trim(),
    mode: params['repo-mode']
  };
}

function isGitInstalled() {
  try {
    execSync('git --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function extractDependencies(packageJsonPath) {
  if (!fs.existsSync(packageJsonPath)) {
    console.warn(` Файл package.json не найден по пути: ${packageJsonPath}`);
    return [];
  }

  try {
    const content = fs.readFileSync(packageJsonPath, 'utf8');
    const pkg = JSON.parse(content);
    const deps = pkg.dependencies || {};
    return Object.keys(deps).map(name => ({
      name,
      version: deps[name]
    }));
  } catch (e) {
    console.error(' Ошибка при чтении или парсинге package.json:', e.message);
    return [];
  }
}

function main() {
  const args = {};
  const a = 0;
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i].startsWith('--')) {
      const key = process.argv[i].slice(2);
      const next = process.argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }

  try {
    const config = validateParams(args);

    console.log('Конфигурация:');
    console.log('  Имя пакета:', config.packageName);
    console.log('  Репозиторий:', config.repo);
    console.log('  Режим:', config.mode);
    console.log('');

    if (!isGitInstalled()) {
      console.error(' Git не установлен. Установите Git для работы с репозиториями.');
      process.exit(1);
    }

    // Создаём временную папку
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deps-analyzer-'));
    console.log(` Временная папка: ${tempDir}`);

    try {
      if (config.mode === 'clone') {
        console.log(' Клонирование репозитория...');
        execSync(`git clone "${config.repo}" .`, {
          cwd: tempDir,
          stdio: 'inherit'
        });
      } else {
        console.error(' Поддерживается только режим "clone" на этом этапе.');
        process.exit(1);
      }

      const packageJsonPath = path.join(tempDir, 'package.json');
      const deps = extractDependencies(packageJsonPath);

      console.log('\n Прямые зависимости пакета:');
      if (deps.length === 0) {
        console.log('  (Нет зависимостей или package.json отсутствует)');
      } else {
        deps.forEach(dep => {
          console.log(`  - ${dep.name}@${dep.version}`);
        });
      }

    } finally {
      // Удаляем временную папку
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log('\n Временная папка удалена.');
      } catch (e) {
        console.warn('  Не удалось удалить временную папку:', tempDir);
      }
    }

  } catch (err) {
    console.error('Ошибка:', err.message);
    process.exit(1);
  }
}

main();