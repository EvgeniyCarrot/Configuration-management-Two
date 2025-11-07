#!/usr/bin/env node

const fs = require('fs');
const url = require('url');

// Парсинг аргументов вида --key value
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++; // пропускаем следующий аргумент
      } else {
        args[key] = true; // флаг без значения
      }
    }
  }
  return args;
}

// Валидация параметров с выбросом ошибок
function validateParams(params) {
  const errors = [];

  // 1. Имя анализируемого пакета
  if (!params['package-name'] || typeof params['package-name'] !== 'string' || params['package-name'].trim() === '') {
    errors.push('Параметр --package-name обязателен и не может быть пустым.');
  } else {
    params['package-name'] = params['package-name'].trim();
  }

  // 2. URL репозитория или путь к файлу
  if (!params['repo']) {
    errors.push('Параметр --repo обязателен (URL или путь к файлу).');
  } else {
    const repo = params['repo'];
    try {
      new URL(repo);
      // Если это валидный URL — ок
    } catch (e) {
      // Иначе проверяем, существует ли локальный путь
      if (!fs.existsSync(repo)) {
        errors.push(`Параметр --repo не является валидным URL и не указывает на существующий файл/директорию: ${repo}`);
      } else {
        params['repo'] = fs.realpathSync(repo);
      }
    }
  }

  // 3. Режим работы с репозиторием
  const validModes = ['clone', 'use-local', 'download'];
  if (!params['repo-mode'] || !validModes.includes(params['repo-mode'])) {
    errors.push(`Параметр --repo-mode обязателен и должен быть одним из: ${validModes.join(', ')}.`);
  }

  // 4. Режим вывода ASCII-дерева (логический флаг)
  if (params['tree-output'] !== undefined) {
    const val = String(params['tree-output']).toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(val)) {
      params['tree-output'] = true;
    } else if (['false', '0', 'no', 'off'].includes(val)) {
      params['tree-output'] = false;
    } else {
      errors.push('Параметр --tree-output должен быть логическим: true/false, yes/no, 1/0.');
    }
  } else {
    params['tree-output'] = false; // значение по умолчанию
  }

  // 5. Максимальная глубина анализа
  if (params['max-depth'] !== undefined) {
    const depth = Number(params['max-depth']);
    if (isNaN(depth) || !Number.isInteger(depth) || depth < 0) {
      errors.push('Параметр --max-depth должен быть неотрицательным целым числом.');
    } else {
      params['max-depth'] = depth;
    }
  } else {
    params['max-depth'] = 3; // значение по умолчанию
  }

  // 6. Подстрока для фильтрации
  if (params['filter'] !== undefined) {
    if (typeof params['filter'] !== 'string') {
      errors.push('Параметр --filter должен быть строкой.');
    } else {
      params['filter'] = params['filter'].trim();
    }
  } else {
    params['filter'] = ''; // пустая строка = без фильтрации
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
}

// Вывод параметров в формате ключ-значение
function printParams(params) {
  console.log('Параметры приложения:');
  for (const [key, value] of Object.entries(params)) {
    console.log(`${key}: ${value}`);
  }
}

// Основная функция
function main() {
  try {
    const rawArgs = parseArgs(process.argv);
    const params = { ...rawArgs }; // копия

    validateParams(params);
    printParams(params);
  } catch (err) {
    console.error('Ошибки в параметрах:');
    console.error(err.message);
    process.exit(1);
  }
}

main();