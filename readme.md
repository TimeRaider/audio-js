YandexAudio
===========
YandexAudio — JavaScript-библиотека, предназначенная  для воспроизведения аудиоданных в браузере. Работа YandexAudio базируется на технологиях html5 audio и flash. Библиотека предоставляет удобный интерфейс для добавления этих технологий на страницу и управления их настройками. При этом YandexAudio решает основные проблемы, связанные с использованием audio и flash – неполная поддержка браузерами, трудная отладка ошибок и др.

Основные возможности YandexAudio:
  - автоматическое определение поддерживаемых браузером технологий;
  - подключение flash-плеера на страницу с возможностью отображения видимого flash-апплета;
  - автоматическая перезагрузка плеера при возникновении ошибки (например из-за заблокированного flash-содержимого);
  - предзагрузка следующего трека, параллельно с воспроизведением текущего;
  - детектирование и использование технологий Web Audio API;
  - эквалайзер (с готовым набором пресетов) с возможностью настройки количества и частоты полос пропускания.



Подключение
----------
Существует 2 способа подключения данной библиотеки:

  - **npm** - если ваш проект использует сборку скриптов с помощью browserify или аналога, то можно просто подключать
  библиотку как npm-пакет `var YandexAudio = require('YandexAudio')`;
  - **скрипт** - достаточно подключить основной файл скрипта 
  ([dist/index.js](https://music.yandex.ru/api/audio/dist/index.js) 
  или [dist/index.min.js](https://music.yandex.ru/api/audio/dist/index.min.js)  - минифицированную версию) 
  в тело страницы и далее использовать глобально доступный объект [spec/Audio.md](ya.music.Audio).


Использование
------------
### Создание экземпляра плеера:

```javascript
    var audioPlayer = new ya.music.Audio(preferredPlayerType, flashOverlayElement);
    audioPlayer.initPromise().then(function() {
      console.log("Аудио-плеер готов к работе");
    }, function() {
      console.error("Не удалось инициализировать аудио-плеер");
    });
```

  - **preferredPlayerType** - предпочитаемый тип плеера. Может принимать значения: `"html5"`, `"flash"` или любое ложное значение (false, null, undefined, 0, ""). Если выбранный тип плеера окажется недоступен, будет запущен оставшийся тип. Если параметр не передан, либо указано ложное значение, то API автоматически выберет поддерживаемый тип плеера.
  - **flashOverlayElement** - HTMLElement, в который требуется встроить flash-апплет. Передается в том случае, если необходимо отобразить видимый flash-апплет для отключения различных блокировщиков flash'а.

### Запуск воспроизведения

```javascript
    audioPlayer.play(src).then(function() {
      console.log("Воспроизведение успешно началось");
    }, function(err) {
      console.error("Не удалось начать воспроизведенние", err);
    });
```

### Управление воспроизведением

```javascript
    audioPlayer.pause(); // пауза
    audioPlayer.resume(); // продолжение воспроизведения
    audioPlayer.stop(); // остановка воспроизведения и загрузки трека
    
    console.log("Ссылка на текущий трек", audioPlayer.getSrc());
    console.log("Длительность трека", audioPlayer.getDuration());
    console.log("Текущая позиция воспроизведения", audioPlayer.getPosition());
    console.log("Длительность загруженной части", audioPlayer.getLoaded());
    console.log("Время воспроизведения трека", audioPlayer.getPlayed());
    
    console.log("Новая позиция воспроизведения", audioPlayer.setPosition(position));
```

### Прослушивание событий

```javascript
    audioPlayer.on(ya.music.Audio.EVENT_STATE, function(state) {
      switch(state) {
        case ya.music.Audio.STATE_INIT: console.log("Инициализация плеера"); break;
        case ya.music.Audio.STATE_IDLE: console.log("Плеер готов и ожидает"); break;
        case ya.music.Audio.STATE_PLAYING: console.log("Плеер проигрывает музыку"); break;
        case ya.music.Audio.STATE_PAUSED: console.log("Плеер поставлен на паузу"); break;
        case ya.music.Audio.STATE_CRASHED: console.log("Не удалось инициализировать плеер"); break;
      }
    });
    
    var logEvent = function(text) { return function(data) { console.log(text, data); }; };
    audioPlayer.on(ya.music.Audio.EVENT_PLAY, logEvent("Плеер начал воспроизведение трека"));
    audioPlayer.on(ya.music.Audio.EVENT_STOP, logEvent("Остановка воспроизведения"));
    audioPlayer.on(ya.music.Audio.EVENT_PAUSE, logEvent("Пауза воспроизведения"));
    
    audioPlayer.on(ya.music.Audio.EVENT_PROGRESS, logEvent("Обновление позиции воспроизведения"));
    audioPlayer.on(ya.music.Audio.EVENT_ENDED, logEvent("Воспроизведение трека завершено"));
    
    audioPlayer.on(ya.music.Audio.EVENT_LOADING, logEvent("Трек начал загружаться"));
    audioPlayer.on(ya.music.Audio.EVENT_LOADED, logEvent("Трек загружен полностью"));
    
    audioPlayer.on(ya.music.Audio.EVENT_VOLUME, logEvent("Изменение громкости"));
    
    audioPlayer.on(ya.music.Audio.EVENT_ERROR, logEvent("Возникла ошибка при воспроизведении"));
    audioPlayer.on(ya.music.Audio.EVENT_CRASHED, logEvent("Крах инициализации"));
    
    audioPlayer.on(ya.music.Audio.EVENT_SWAP, logEvent("Переключение между текущим и предзагруженным треком"));
```    

### Прелоадер
В большинство команд управления можно передать вторым аргументом `1`, чтобы они применялись к прелоадеру вместо текущего плеера.
Для прослушивания событий плероадера следует использовать префикс `ya.music.Audio.PRELOADER_EVENT`.

```javascript
    // Следует обратить внимание, что обещание разрешится, когда трек начал загружаться, а не когда загрузился
    audioPlayer.preload(src).then(function() {
        console.log("Началась предзагрузка трека");
    }, function(err) {
        console.error("Ну удалось начать загрузку трека", err);
    });
    
    audioPlayer.playPreloaded().then(function() {
        console.log("Воспроизведение успешно началось");
    }, function(err) {
        console.error("Не удалось начать воспроизведенние", err);
    });
    
    audioPlayer.stop(1); // остановка загрузки трека
    
    console.log("Ссылка на текущий трек", audioPlayer.getSrc(1));
    console.log("Длительность трека", audioPlayer.getDuration(1));
    console.log("Длительность загруженной части", audioPlayer.getLoaded(1));
    
    // Два похожих метода, но первый является сахаром для audioPlayer.getSrc(1) == src, а второй проверяет успех начала загрузки
    console.log("Трек " + (audioPlayer.isPreloading(src) ? "загружается/ожидает загрузки" : "не загружается"));
    console.log("Трек " + (audioPlayer.isPreloaded(src) ? "начал загружаться" : "не загружается"));
    
    var logEvent = function(text) { return function(data) { console.log(text, data); }; };
    audioPlayer.on(ya.music.Audio.PRELOADER_EVENT + ya.music.Audio.EVENT_STOP, logEvent("Остановка загрузки"));
    
    audioPlayer.on(ya.music.Audio.PRELOADER_EVENT + ya.music.Audio.EVENT_PROGRESS, logEvent("Процесс загрузки"));
    
    audioPlayer.on(ya.music.Audio.PRELOADER_EVENT + ya.music.Audio.EVENT_LOADING, logEvent("Трек начал загружаться"));
    audioPlayer.on(ya.music.Audio.PRELOADER_EVENT + ya.music.Audio.EVENT_LOADED, logEvent("Трек загружен полностью"));
    
    audioPlayer.on(ya.music.Audio.PRELOADER_EVENT + ya.music.Audio.EVENT_ERROR, logEvent("Возникла ошибка при загрузке"));
```

### Документация
  * [Справочник API](spec)
  * [Быстрый старт](tutorial/quick-start.md)
  * [Обработка звука](tutorial/fx.md)
  * [Подводные камни](tutorial/corner-case.md)
  * [Полезная теоретическая информация](tutorial/sound.md)
  * [Web Audio API](tutorial/web-audio-api.md)
  * [Инструкции для контрибьюторов](tutorial/contrib.md)
