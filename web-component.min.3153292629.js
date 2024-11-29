var defineComponent = (function () {
'use strict';

/**
 * Стандартная функция для получения значения из объекта `obj`
 * по ключу `key`. Использует получение данных по контракту, который
 * генерирует модуль `./compile.js`
 * @param {*} obj
 * @param {String|Array|Function} key
 * @param {Function} [wrap] Функция для оборачивания контекста предиката
 * @return {*}
 */
function get(obj, key, wrap) {
    if (obj == null) {
        return obj;
    }

    if (typeof key === 'function') {
        return predicate(obj, key, wrap);
    }

    if (obj instanceof Collection) {
        if (typeof key === 'number') {
            return obj.items[key];
        }
        return new Collection(obj.items.map(function (item) { return get(item, key); }).filter(isDefined));
    }

    if (key === '*') {
        return obj instanceof Collection ? obj : new Collection(obj);
    }

    if (Array.isArray(key)) {
        // Вызов функции. Имя функции — `key[0]`, аргументы: `key[1...]`
        return obj[key[0]].apply(obj, key.slice(1));
    }

    return obj instanceof Map ? obj.get(key) : obj[key];
}

var Collection = function Collection(obj) {
    var items;
    if (Array.isArray(obj)) {
        items = obj;
    } else if (obj instanceof Map || obj instanceof Set) {
        items = Array.from(obj.values());
    } else if (obj != null) {
        items = [obj];
    } else {
        items = [];
    }

    this.items = items;
};

Collection.prototype.isCollection = function isCollection () {
    return true;
};

Collection.prototype.valueOf = function valueOf () {
    if (this.items.length === 0) {
        return null;
    }

    if (this.items.length === 1) {
        return this.items[0];
    }

    return this.items;
};

/**
 * Фильтрация объекта по предикату
 * @param {*} obj
 * @param {Function} fn
 * @param {Function} [call] Функция, которая вызывает функцию предиката
 * в заданном контексте
 */
function predicate(obj, fn, call) {
    call = call || _call;
    var result = [];
    var position = 0;

    if (obj instanceof Collection) {
        obj = obj.items;
    }

    if (typeof obj.forEach === 'function') {
        // Есть итератор у коллекции, пройдёмся по ней
        obj.forEach(function (value, name) {
            if (call(fn, value, name, position++)) {
                result.push(value);
            }
        });
    } else if (typeof obj === 'object') {
        // Итерация по ключам объекта
        Object.keys(obj).forEach(function (key) {
            if (call(fn, obj[key], key, position++)) {
                result.push(obj[key]);
            }
        });
    } else if (call(fn, obj, null, position)) {
        // Не интерируемая коллекция
        result.push(obj);
    }

    // return result.length > 1 ? new Collection(result) : result[0];
    return new Collection(result);
}

function _call(fn, value) {
    return fn(value);
}

function isDefined(value) {
    return value != null;
}

var RenderCache = function RenderCache() {
    this.parent = null;
    this.tip = new RenderCacheNode();
    this.current = this.tip;
};

/**
 * Выполняет переход состояния кэша в указанную точку относительно текущего
 * состония. Если следующее соседнее состояния меньше указанного хэша,
 * все состояния, которые меньше `hash`, будут удалены
 * @param  {Number} hash Хэш, на который нужно перейти.
 * @param {Boolean} [sequntial] Флаг, указывающий, что `hash` является
 * последовательным значением. В случае, если при удалении промежуточных
 * звеньев появится узел с большим значением хэша, чем указано в `hash`,
 * удаление прекратиться. В противном случае элементы будут удаляться до тех
 * пор, пока не будет найден узел с `hash`
 * @return {Boolean} Вернёт `true`, если состояние `hash` присуствтует в кэше
 */
RenderCache.prototype.enter = function enter (hash, sequntial) {
    if (this.next(hash)) {
        // Успешно перешли в следующее состояние с указанным хэшом
        return true;
    }

    if (sequntial) {
        // Проверим, можем ли мы пройти вперёд по списку до нужного нам элемента,
        // удаляя промежуточные узлы.
        var node$1 = this.current;
        while (node$1.next && node$1.next.hash < hash) {
            node$1.next = node$1.next.dispose();
        }

        return this.next(hash);
    }

    // Хэш не является последовательным. Заглянем вперёд: если есть узел
    // с таким же хэшом, удалим все промежуточные звенья, иначе ничего
    // не будем делать
    var toRemove = [];
    var node = this.current.next;
    while (node && node.hash !== hash) {
        toRemove.push(node);
        node = node.next;
    }

    if (node) {
        this.current.next = node;
        for (var i = 0; i < toRemove.length; i++) {
            toRemove[i].dispose();
        }
        return this.next(hash);
    }

    return false;
};

/**
 * Перемещает указатель на следующую точку кэша, если у неё хэш равен указанному
 * @param  {*}   hash
 * @return {Boolean} Вернёт `true` если следующее значение соответствует `hash`
 */
RenderCache.prototype.next = function next (hash) {
    var next = this.current.next;
    if (next && next.hash === hash) {
        this.current = next;
        return true;
    }
    return false;
};

/**
 * Вставляет узел кэша по текущему указателю. Если хэш текущего состояния
 * равен `hash`, просто заменяет значение у текущего состояния
 * @param  {*} hash
 * @param  {*} value
 */
RenderCache.prototype.insert = function insert (hash, value) {
    var node = this.current;
    if (node.hash === hash) {
        node.value = value;
    } else {
        var next = new RenderCacheNode(hash, value);
        next.next = node.next;
        this.current = node.next = next;
    }
};

RenderCache.prototype.trim = function trim () {
    var node = this.current;
    while (node && node.next) {
        node.next = node.next.dispose();
    }
};

RenderCache.prototype.finalize = function finalize () {
    this.trim();
    this.reset();
};

RenderCache.prototype.reset = function reset () {
    this.current = this.tip;
};

RenderCache.prototype.dispose = function dispose () {
    var ctx = this.tip;
    while (ctx) {
        ctx = ctx.dispose();
    }
    this.tip = this.current = null;
};

var RenderCacheNode = function RenderCacheNode(hash, value) {
    this.hash = hash;
    this.value = value;
    this.next = null;
};

RenderCacheNode.prototype.dispose = function dispose () {
    var value = this.value;

    if (value) {
        if (typeof value.dispose === 'function') {
            value.dispose();
        } else {
            var parent = value.parentNode;
            if (parent) {
                parent.removeChild(value);
            }
        }
        this.value = null;
    }

    return this.next;
};

/**
 * Промежуточный класс для хранения данных об отрисовываемом элементе
 */
var RenderContext = function RenderContext() {
    this.node = null;
    this.parent = null;
    this.attributes = null;
    this.namespace = null;
    this.updated = false;
    this.children = 0;
    this.slotChildren = new Map();
};

RenderContext.prototype.reset = function reset () {
    this.namespace = this.node = this.parent = this.attributes = null;
    this.children = 0;
    this.updated = false;
    this.slotChildren.clear();
    return this;
};

RenderContext.prototype.text = function text (value) {
    var defaultSlot = null;
    var target = this.node.getSlot(defaultSlot);

    if (target) {
        this.slotChildren.set(defaultSlot, 1);
        if (target.textContent !== value) {
            target.textContent = value;
            return this.updated = true;
        }

        return false;
    }

    this.children = 1;
    if (this.node.setText(value)) {
        this.updated = true;
        return true;
    }

    return false;
};

RenderContext.prototype.insert = function insert (node, slot) {
    slot = slot || null;
    var target = this.node.getSlot(slot);
    var result = false;

    if (target) {
        // Добавляем узел в слот
        var pos = this.slotChildren.get(slot) || 0;
        result = insertChildAt(target, node, pos);
        this.slotChildren.set(slot, pos + 1);
    } else {
        result = insertChildAt(this.node.elem, node, this.children);
        this.children++;
    }

    return result;
};

function insertChildAt(parent, child, pos) {
    var ref = parent.childNodes[pos];

    if (ref === child) {
        return false;
    }

    !ref ? parent.appendChild(child) : parent.insertBefore(child, ref);
    return true;
}

/**
 * Контейнер для хранения отрисованного DOM-элемента в кжше рендеринга
 */
var DOMContainer = function DOMContainer(elem, allowSlots) {
    this.elem = elem;
    this.attrs = null;
    this.text = null;
    this.allowSlots = !!allowSlots;
};

DOMContainer.prototype.setText = function setText (value) {
    // NB не проверяем значение по `.text`, так как этот текст может меняться
    // пользователем в contenteditable элементе
    if (this.elem.textContent !== value) {
        this.elem.textContent = value;
        return true;
    }

    return false;
};

DOMContainer.prototype.getSlot = function getSlot (name, allowSlots) {
    return (allowSlots || this.allowSlots) && this.elem.getSlot && this.elem.getSlot(name);
};

DOMContainer.prototype.dispose = function dispose () {
    var parent = this.elem.parentNode;
    if (parent) {
        parent.removeChild(this.elem);
    }

    this.elem = this.attrs = this.text = null;
};

function createObjectPool(Ctor) {
    var pointer = -1;
    var pool = [];

    return {
        alloc: function alloc() {
            if (!pool[++pointer]) {
                pool[pointer] = new Ctor();
            }
            return pool[pointer];
        },
        release: function release(obj) {
            pointer--;
            return obj;
        }
    };
}

var contextPool$1 = createObjectPool(RenderContext);
var xlinkNS = 'http://www.w3.org/1999/xlink';

var Renderer = function Renderer(target) {
    this._target = new DOMContainer(target);
    this.context = null;
    this._eventHandlers = new WeakMap();
    this.cache = new RenderCache();
};

Renderer.prototype.open = function open (hash, name, attrs) {
    var cache = this.cache;
    var nextNode = cache.current.next;
    var ctx = contextPool$1.alloc();

    ctx.parent = this.context;
    ctx.attributes = attrs;
    ctx.namespace = attrs && attrs.xmlns || this.context.namespace;

    if (!nextNode || nextNode.hash !== hash) {
        ctx.updated = true;
    }

    if (!cache.enter(hash, true)) {
        var elem = name === 'slot' && this._target.getSlot(attrs && attrs.name, true);
        if (elem) {
            elem = new DOMContainer(elem);
        } else {
            elem = createElement(name, ctx.namespace);
        }

        cache.insert(hash, elem);
    }

    ctx.node = cache.current.value;
    this.context.insert(ctx.node.elem, attrs && attrs.slot);
    this.context = ctx;
};

Renderer.prototype.close = function close () {
    var oldCtx = this.context;
    var node = oldCtx.node;
    var attrs = oldCtx.attributes;
    var updated = false;

    if (attrs != null && attrs !== node.attrs) {
        updated = this.syncAttributes(node.elem, attrs, node.attrs);
    }

    node.attrs = attrs;
    this.context = oldCtx.parent;

    if (updated || oldCtx.updated) {
        node.elem.render && node.elem.render(true, oldCtx.slotChildren);
        this.context.updated = true;
    }

    contextPool$1.release(oldCtx.reset());
};

Renderer.prototype.attr = function attr (name, value) {
    var ctx = this.context;
    if (!ctx.attributes) {
        ctx.attributes = {};
    }
    ctx.attributes[name] = value;
};

Renderer.prototype.addClass = function addClass$1 (value) {
    var ctx = this.context;
    if (!ctx.attributes) {
        ctx.attributes = {};
    }

    ctx.attributes['class'] = addClass(ctx.attributes['class'], value);
};

Renderer.prototype.setText = function setText (value) {
    return this.context.text(value);
};

Renderer.prototype.addText = function addText (hash, value) {
    var ctx = this.context;
    var cache = this.cache;

    if (!cache.enter(hash, true)) {
        var node = document.createTextNode(value);
        cache.insert(hash, node);
        ctx.updated = true;
    } else if (cache.current.value.nodeValue != value) {
        cache.current.value.nodeValue = value;
        ctx.updated = true;
    }

    ctx.insert(cache.current.value);
};

Renderer.prototype.emptySlot = function emptySlot () {
    return !this.context.node.elem.hasAttribute('slotted');
};

Renderer.prototype.begin = function begin () {
    this.context = contextPool$1.alloc();
    this.context.node = this._target;
    this.cache.reset();
};

Renderer.prototype.finalize = function finalize () {
    this.cache.finalize();
    contextPool$1.release(this.context.reset());
    this.context = null;
};

/**
 * Регистрирует или удаляет обработчик события для указанного события
 * @param {String} type Тип обрабатываемого события
 * @param {Element} elem Элемент, для которого обрабатываем событие
 * @param {Function} fn Обработчик события
 */
Renderer.prototype.setEventHandler = function setEventHandler (type, elem, fn) {
    var eventMap = this._eventHandlers.get(elem);
    if (fn) {
        if (!eventMap) {
            // Ещё ни разу не регистрировали это событие
            this._eventHandlers.set(elem, eventMap = new Map());
        }

        if (eventMap.get(type) !== fn) {
            // Ещё не регистрировали хэндлер либо он поменялся
            eventMap.set(type, fn);
            elem.addEventListener(type, this);
        }
    } else if (eventMap && eventMap.has(type)) {
        elem.removeEventListener(type, this);
        eventMap.delete(type);

        if (!eventMap.size) {
            this._eventHandlers.delete(elem);
        }
    }
};

/**
 * Обработка события
 * @see https://developer.mozilla.org/en-US/docs/Web/API/EventListener
 * @param {Event} event
 */
Renderer.prototype.handleEvent = function handleEvent (event) {
    var elem = event.currentTarget;
    var eventMap = this._eventHandlers.get(elem);
    if (eventMap && eventMap.has(event.type)) {
        var component = this._target.elem;
        var args = [event, component];
        var handler = eventMap.get(event.type);

        if (typeof handler === 'string') {
            handler = component[handler];
        } else if (Array.isArray(handler)) {
            args = handler.slice(1).concat(args);
            handler = component[handler[0]];
        }

        if (typeof handler === 'function') {
            handler.apply(elem, args);
        }
    }
};

/**
 * Удаляет все зарегистрированные обработчики событий у указанного элемента
 * @param {Element} elem
 */
Renderer.prototype.clearEventHandlers = function clearEventHandlers (elem) {
        var this$1 = this;

    var eventMap = this._eventHandlers.get(elem);
    if (eventMap) {
        eventMap.keys().forEach(function (event) { return elem.removeEventListener(event, this$1); });
        eventMap.clear();
        this._eventHandlers.delete(elem);
    }
};

Renderer.prototype.syncAttributes = function syncAttributes (node, attrs, prevAttrs) {
        var this$1 = this;

    var name, event, value, updated = false;
    var isEvent = false, isInlineEvent = false;

    // Обновляем/добавляем атрибуты
    for (name in attrs) {
        value = attrs[name];
        isEvent = hasEventPrefix(name);
        event = isEvent && name.charCodeAt(2) === 45 /* - */ && name.slice(3);
        isInlineEvent = isEvent && name in node;

        if (value == null) {
            if (event) {
                this$1.setEventHandler(event, node, null);
            } else if (isInlineEvent) {
                node[name] = null;
            } else if (prevAttrs && prevAttrs[name] !== value) {
                node.removeAttribute(name);
                updated = true;
            }
        } else if (!prevAttrs || prevAttrs[name] !== value) {
            if (event) {
                this$1.setEventHandler(event, node, value);
            } else if (isInlineEvent) {
                node[name] = value;
            } else {
                setAttribute(node, name, value);
                updated = true;
            }
        }
    }

    return updated;
};

// Работа с кэшом рендеринга
Renderer.prototype.pushCache = function pushCache (hash, sequntial) {
    if (!this.cache.enter(hash, sequntial)) {
        this.cache.insert(hash, new RenderCache());
    }

    var innerCache = this.cache.current.value;
    innerCache.parent = this.cache;
    this.cache = innerCache;
};

Renderer.prototype.popCache = function popCache () {
    if (this.cache.parent) {
        this.cache.finalize();
        this.cache = this.cache.parent;
    }
};

function createElement(name, namespace) {
    // Некоторые слишком «умные» расширения переопределяют метод
    // `docment.createElement()`, из-за чего при использовании полифилла
    // Custom Elements возникают всякие неприятные спецэффекты с поздним
    // апгрэйдом элементов (неправильный рендеринг) и просядает производительность.
    // Будет стараться дёргать максимально нативный метод создания элементов
    // NB если метод `createElement()` у документа переопределён, он станет
    // собственным свойством. Полифил меняет метод на уровне прототипа
    var elem = document.hasOwnProperty('createElement')
        ? _createElementViaProto(name, namespace)
        : _createElement(name, namespace);
    return new DOMContainer(elem, true);
}

function _createElementViaProto(name, namespace) {
    var proto = document.constructor.prototype;
    return namespace
        ? proto.createElementNS.call(document, namespace, name)
        : proto.createElement.call(document, name);
}

function _createElement(name, namespace) {
    return namespace
        ? document.createElementNS(namespace, name)
        : document.createElement(name);
}

/**
 * Проверяет, есть ли у указанной строки префикс события (начинается на `on`)
 * @param {String} str
 */
function hasEventPrefix(str) {
    return str.charCodeAt(0) === 111 && str.charCodeAt(1) === 110;
}

function addClass(current, newClass) {
    if (!current) {
        return newClass.trim();
    }

    current = " " + (current.replace(/\s+/g, ' ')) + " ";
    if (current.indexOf((" " + newClass + " ")) === -1) {
        current += newClass;
    }

    return current.trim();
}

/**
 * Записывает значение `value` в атрибут `name` элемента `elem`
 * @param {Element} elem
 * @param {String} name
 * @param {*} value
 */
function setAttribute(elem, name, value) {
    if (elem.supportsObjectAttributes || typeof value !== 'object') {
        // NB костыль для правильного рендеринга SVG.
        // Вся надежда на новый рендеринг, где должны правильно учитываться
        // атрибуты из разных нэймспэйсов
        if (/^xlink:/.test(name)) {
            elem.setAttributeNS(xlinkNS, name, value);
        } else {
            elem.setAttribute(name, value);
        }
    } else {
        elem.setAttribute(name, '');
        var attrNode = elem.attributes.getNamedItem(name);
        attrNode.objectValue = value;
    }
}

var VariableScope = function VariableScope(context, parent) {
    this.context = context;
    this.parent = parent;
    this._vars = {};
};

VariableScope.prototype.get = function get (name) {
    if (name in this._vars) {
        return this._vars[name];
    }

    if (this.parent) {
        return this.parent.get(name);
    }
};

VariableScope.prototype.set = function set (name, value) {
    return this._vars[name] = value;
};

/**
 * Обёртка для контекстного значения
 */
var ValueContext = function ValueContext(value, name, position) {
    this.parent = null;
    this.update(value, name, position);
};

ValueContext.prototype.update = function update (value, name, position) {
    this.value = value;
    this.name = name || null;
    this.position = position || 0;
    return this;
};

var VARIABLE_PREFIX = 36; // $
var ATTRIBUTE_PREFIX = 64; // @

var contextPool = createObjectPool(ValueContext);

/**
 * Верхнеуровневые методы, используемые в выражениях
 */
var defaultMethods = {
    /**
     * Возвращает название контекстного объекта. В основном используется внутри
     * итераторов для получения названия ключа текущего объекта итератора.
     * @return {String}
     */
    name: function name() {
        return this.context.name;
    },

    /**
     * Возвращает позицию контекстного объекта внутри итерируемой коллекции.
     * @return {Number}
     */
    position: function position() {
        return this.context.position;
    },

    /**
     * Возвращает количество элементов в указанной коллекции. Для обычного объекта
     * вернёт 1, для null — 0
     * @param {*} obj
     * @return {Number}
     */
    count: function count(obj) {
        if (obj == null) {
            return 0;
        }

        if (Array.isArray(obj)) {
            return obj.length;
        }

        if (obj instanceof Map || obj instanceof Set) {
            return obj.size;
        }

        if ('isCollection' in obj && 'items' in obj) {
            return obj.items.length;
        }

        return 1;
    },

    /**
     * Проверяет, содержится ли указанное `value` значение внутри коллекции
     * `collection`
     * @param {*} collection
     * @param {*} value
     * @return {Boolean}
     */
    contains: function contains(collection, value) {
        if (collection instanceof Map || collection instanceof Set) {
            return collection.has(value);
        }

        if (Array.isArray(collection) || (typeof collection === 'string' && value != null)) {
            return collection.indexOf(value) !== -1;
        }

        return collection != null ? collection === value : false;
    },

    /**
     * Строковое представление указанного объекта
     * @param {*} obj
     * @return {String}
     */
    text: function text(obj) {
        return stringify(obj);
    },

    /**
     * Нормализация пробелов внутри указанной строки: удаляет все пробелы в начале
     * и в конце строки, а все whitespace-символы заменяет на один пробел
     * @param {String} value
     */
    normalizeSpace: function normalizeSpace(value) {
        return stringify(value).trim().replace(/\s+/g, ' ');
    },

    min: Math.min,
    max: Math.max,
    round: Math.round,
    floor: Math.floor,
    ceil: Math.ceil
};

/**
 * Контекст исполнения шаблона
 */
var TemplateContext = function TemplateContext(elem, methods) {
    var this$1 = this;

    this.renderer = new Renderer(elem);
    this.methods = Object.assign({}, defaultMethods, methods);
    this.context = null;
    this._variables = null;

    this._predicateCall = function (fn, value, name, position) {
        this$1._enter(value, name, position);
        var result = fn(this$1);
        this$1._exit();
        return result;
    };
};

TemplateContext.prototype.render = function render (template, data) {
    this.begin(data);
    template(this);
    this.end();
};

TemplateContext.prototype.begin = function begin (data) {
    this.renderer.begin();
    this._enter(data, '#root');
};

TemplateContext.prototype.end = function end () {
    this._exit();
    this.renderer.finalize();
};

TemplateContext.prototype._enter = function _enter (value, name, position) {
    var ctx = contextPool.alloc().update(value, name, position);
    ctx.parent = this.context;
    this.context = ctx;
};

TemplateContext.prototype._exit = function _exit () {
    this.context = contextPool.release(this.context).parent;
};

// Методы получения данных
TemplateContext.prototype.get = function get$1 () {
        var arguments$1 = arguments;
        var this$1 = this;

    var obj = this.context.value;
    var i = 0;

    // Отдельно резолвим первый аргумент, так как там могут быть
    // обращения к зарезеривированным верхнеуровневым свойствам
    var firstArg = arguments[i];
    if (firstArg === 'self') {
        // ссылка на себя
        i++;
    } else if (isVariableAccess(firstArg)) {
        // Запрашиваем переменную
        obj = this._variables && this._variables.get(firstArg.slice(1));
        i++;
    } else if (Array.isArray(firstArg) && firstArg[0] in this.methods) {
        // Вызов глобального метода
        obj = this.methods[firstArg[0]].apply(this, firstArg.slice(1));
        i++;
    }

    for (var il = arguments.length, arg; obj != null && i < il; i++) {
        arg = arguments$1[i];
        obj = isAttributeAccess(arg)
            ? getAttribute(obj, arg)
            : get(obj, arg, this$1._predicateCall);
    }

    return obj instanceof Collection ? obj.valueOf() : obj;
};

/**
 * Итерирование по коллекции с выводом результатов в рендер
 * @param {Number} hash Хеш для хранения результата рендеринга
 * @param {Array|Map|Set} collection Коллекция, по которой нужно итерироваться
 * @param {Function} fn Функция, которая будет вызываться на каждый элемент коллекции
 * @param {Function} [keyFn] Функция для получения уникального ключа элемента
 * коллекции. Ключ используется для идентификации и переиспользоания результата
 * рендеринга элемента коллекции
 */
TemplateContext.prototype.iterate = function iterate (hash, collection, fn, keyFn) {
        var this$1 = this;

    var position = 0;
    this.renderer.pushCache(hash, true);

    if (collection != null) {
        this._enterScope(fn);
        if (!collection.forEach) {
            // Не итерируемый объект
            collection = [collection];
        }

        collection.forEach(function (value, name) {
            this$1._enter(value, name, position++);

            var sequential = !keyFn;
            var key = keyFn && keyFn(this$1);
            if (key == null) {
                key = position;
                sequential = true;
            }

            this$1.renderer.pushCache(key, sequential);
            fn(this$1);
            this$1.renderer.popCache();

            this$1._exit();
        });
        this._exitScope(fn);
    }

    this.renderer.popCache();
};

/**
 * Регистрация переменной
 * @param {String} name
 * @param {*} value
 */
TemplateContext.prototype.variable = function variable (name, value) {
    this._enterScope(this.renderer.context);
    this._variables.set(name, value);
};

// Методы отрисовки
TemplateContext.prototype.open = function open (hash, name, attrs) {
    this.renderer.open(hash, name, attrs);
};

TemplateContext.prototype.close = function close () {
    this._exitScope(this.renderer.context);
    this.renderer.close();
};

TemplateContext.prototype.attr = function attr (name, value) {
    this.renderer.attr(name, value);
};

TemplateContext.prototype.addClass = function addClass (value) {
    this.renderer.addClass(value);
};

TemplateContext.prototype.setText = function setText (value) {
    this.renderer.setText(value);
};

TemplateContext.prototype.addText = function addText (hash, value) {
    this.renderer.addText(hash, value);
};

TemplateContext.prototype.emptySlot = function emptySlot (name) {
    return this.renderer.emptySlot(name);
};

TemplateContext.prototype._enterScope = function _enterScope (ctx) {
    if (!this._variables || this._variables.context !== ctx) {
        this._variables = new VariableScope(ctx, this._variables);
    }
};

TemplateContext.prototype._exitScope = function _exitScope (ctx) {
    if (this._variables && this._variables.context === ctx) {
        this._variables = this._variables.parent;
    }
};

function isAttributeAccess(token) {
    return typeof token === 'string' && token.charCodeAt(0) === ATTRIBUTE_PREFIX;
}

function isVariableAccess(token) {
    return typeof token === 'string' && token.charCodeAt(0) === VARIABLE_PREFIX;
}

function getAttribute(obj, token) {
    if (obj && typeof obj === 'object' && typeof obj.getAttribute === 'function') {
        return obj.getAttribute(token.slice(1));
    }

    return get(obj, token);
}

function stringify(obj) {
    if (obj == null) {
        return '';
    }

    if (typeof obj === 'object') {
        return JSON.stringify(obj);
    }

    return String(obj);
}

var updateTokenPrefix = 1;

var DataModel = function DataModel(data) {
	var this$1 = this;

	this._tokenPrefix = updateTokenPrefix++;
	this._updateTokens = new Map();

	if (data instanceof Map) {
		this._data = data;
	} else {
		this._data = new Map();
		if (data != null) {
			Object.keys(data).forEach(function (key) { return this$1._data.set(key, data[key]); });
		}
	}

	this._subscribers = new Map();
};

var prototypeAccessors = { size: {} };

prototypeAccessors.size.get = function () {
	return this._data.size;
};

DataModel.prototype.keys = function keys () {
	return Array.from(this._data.keys());
};

DataModel.prototype.has = function has (key) {
	return this._data.has(key);
};

DataModel.prototype.get = function get (key) {
	return this._data.get(key);
};

DataModel.prototype.set = function set (key, value, silent) {
	var prev = this.get(key);
	if (prev !== value) {
		this._data.set(key, value);
		if (!silent) {
			this.notify(key, value, prev);
		}
	}
	return this;
};

DataModel.prototype.delete = function delete$1 (key) {
	if (this.has(key)) {
		var prev = this.get(key);
		this._data.delete(key);
		this.notify(key, undefined, prev);
		this._updateTokens.delete(key);
	}
	return this;
};

DataModel.prototype.clear = function clear () {
		var this$1 = this;

	this.keys().forEach(function (key) { return this$1.delete(key); });
	return this;
};

DataModel.prototype.subscribe = function subscribe (key, listener) {
	if (typeof key === 'function') {
		listener = key;
		key = undefined;
	}

	if (typeof listener !== 'function') {
		throw new Error('Listener should be a function');
	}

	if (!this._subscribers.has(key)) {
		this._subscribers.set(key, new Set());
	}
	this._subscribers.get(key).add(listener);
	return this;
};

DataModel.prototype.unsubscribe = function unsubscribe (key, listener) {
	if (typeof key === 'function') {
		listener = key;
		key = undefined;
	}

	if (this._subscribers.has(key)) {
		var listeners = this._subscribers.get(key);
		listeners.delete(key);
		if (!listeners.size) {
			this._subscribers.delete(key);
		}
	}
	return this;
};

DataModel.prototype.notify = function notify (key, newValue, prevValue) {
	// помечаем ключ как обновлённый
	var updated = this._updateTokens.get(key) || 0;
	this._updateTokens.set(key, updated + 1);

	if (this._subscribers.has(key)) {
		this._subscribers.get(key)
		.forEach(function (listener) { return listener(newValue, prevValue); });
	}

	// уведомляем глобальных подписчиков
	if (this._subscribers.has(undefined)) {
		this._subscribers.get(undefined)
		.forEach(function (listener) { return listener(key, newValue, prevValue); });
	}
	return this;
};

DataModel.prototype.updateToken = function updateToken (key) {
	var update = this._updateTokens.get(key) || 0;
	return ((this._tokenPrefix) + "." + update);
};

DataModel.prototype.keyForValue = function keyForValue (value) {
		var this$1 = this;

	var keys = this.keys();
	for (var i = 0, il = keys.length; i < il; i++) {
		if (this$1.get(keys[i]) === value) {
			return keys[i];
		}
	}

	return undefined;
};

DataModel.prototype.dispose = function dispose () {
	this._subscribers.clear();
	this.clear();
	this._data = null;
};

Object.defineProperties( DataModel.prototype, prototypeAccessors );

var TYPE_STRING = 'string';
var TYPE_NUMBER = 'number';
var TYPE_BOOLEAN = 'boolean';
var TYPE_JSON = 'json';
var TYPE_ANY = 'any';

var dataTypes = new Set([TYPE_STRING, TYPE_NUMBER, TYPE_BOOLEAN, TYPE_JSON, TYPE_ANY]);
var negatives = new Set(['0', 'false', 'no', '']);
var allowedAttributes = /^class|id|style|slot|(?:data|on)\-[\w\-]+$/;

var ComponentModel = (function (DataModel) {
    function ComponentModel(definition, data) {
        var this$1 = this;

        DataModel.call(this);

        this.definition = readModelDefinition(definition);
        this._subscriptions = new Map();

        if (data) {
            Object.keys(data).forEach(function (key) { return this$1.set(key, data[key]); });
        }
    }

    if ( DataModel ) ComponentModel.__proto__ = DataModel;
    ComponentModel.prototype = Object.create( DataModel && DataModel.prototype );
    ComponentModel.prototype.constructor = ComponentModel;

    ComponentModel.prototype.keys = function keys () {
        return Array.from(this.definition.keys());
    };

    ComponentModel.prototype.supports = function supports (key) {
        return this.definition.has(key) || allowedAttributes.test(key);
    };

    ComponentModel.prototype.get = function get (key) {
        if (!this.supports(key)) {
            throw new Error(("The \"" + key + "\" attribute is not defined in component model"));
        }

        // Есть явно указанный ключ
        if (this.has(key)) {
            return DataModel.prototype.get.call(this, key);
        }

        // Нет определения атрибута, но прошли самую первую проверку:
        // запрашиваем базовый атрибут типа `id`, `class`, который ещё не
        // присвоили компоненту
        if (!this.definition.has(key)) {
            return null;
        }

        return this.definition.get(key).value;
    };

    /**
     * Обновление значения модели по указанному ключу
     * @param  {String} key
     * @param  {*} value
     * @param  {Boolean} silent Нужно ли оповещать слушателей об изменении значения
     * @return {Boolean} Вернёт `true` если значение действительно поменялось
     * или `false`, если оно осталось прежним
     */
    ComponentModel.prototype.set = function set (key, value, silent) {
        // Убедимся, что такой ключ определён в модели
        if (!this.supports(key)) {
            throw new Error(("The \"" + key + "\" attribute is not defined in component model"));
        }

        // NB Единственная ситуация, при которой не может быть определения
        // для указанного ключа модели — записываем базовый атрибут типа `id`, 'class'
        // и т.д.
        var keyType = this.type(key);
        var prevValue = DataModel.prototype.get.call(this, key);

        value = castValue(value, keyType);
        if (value !== prevValue) {
            DataModel.prototype.set.call(this, key, value, silent);
            this._updateSubscription(key, value);
            return true;
        }

        return false;
    };

    ComponentModel.prototype.delete = function delete$1 (key) {
        if (this.has(key)) {
            DataModel.prototype.delete.call(this, key);
        }
    };

    ComponentModel.prototype.notify = function notify (key, newValue, prevValue) {
        DataModel.prototype.notify.call(this, key, newValue, prevValue);
    };

    ComponentModel.prototype.dispose = function dispose () {
        this.definition.clear();
        this._subscriptions.forEach(function (dispose) { return dispose(); });
        this._subscriptions.clear();
        this._subscriptions = this.definition = null;
        DataModel.prototype.dispose.call(this);
    };

    /**
     * Возвращает тип указанного ключа модели (@see `TYPE_*`)
     * @return {String} Вернёт `null`, если запрашивается неподдерживаемый
     * имя ключа
     */
    ComponentModel.prototype.type = function type (key) {
        if (!this.supports(key)) {
            return null;
        }

        // NB Единственная ситуация, при которой не может быть определения
        // для указанного ключа модели — базовый атрибут типа `id`, 'class'
        // и т.д.
        return this.definition.has(key) ? this.definition.get(key).type : TYPE_STRING;
    };

    /**
     * Обновляет подписку на изменение источника данных, если это возможно
     * @param {String} key
     */
    ComponentModel.prototype._updateSubscription = function _updateSubscription (key) {
        if (this._subscriptions.has(key)) {
            var dispose = this._subscriptions.get(key);
            this._subscriptions.delete(key);
            dispose();
        }
    };

    return ComponentModel;
}(DataModel));

/**
 * Считывает декларацию модели компонента из указанного источника
 * @param {Object} source Источник данных с декларацией модели
 * @return {Map}
 */
function readModelDefinition(source) {
    var result = new Map();

    if (source) {
        for (var name in source) {
            var type = source[name].type || TYPE_ANY;

            if (!dataTypes.has(type)) {
                throw new Error(("Unsupported type \"" + type + "\" in \"" + name + "\" model key"));
            }

            var value = castValue(source[name].value, type);
            result.set(name, { type: type, value: value });
        }
    }

    return result;
}

/**
 * Приводит значение `value` к указанному типу
 * @param  {*} value
 * @param  {String} type
 * @return {*}
 */
function castValue(value, type) {
    switch (type) {
        case TYPE_STRING:
            return toString(value);

        case TYPE_NUMBER:
            if (typeof value === 'boolean') {
                return value ? 1 : 0;
            }
            return Number(toString(value));

        case TYPE_BOOLEAN:
            return typeof value === 'boolean' ? value : !negatives.has(toString(value));

        case TYPE_JSON:
            if (typeof value === 'string') {
                return value ? JSON.parse(value) : null;
            } else if (value == null) {
                return null;
            }

            return value;
    }

    return value;
}

function toString(obj) {
    return obj == null ? '' : String(obj);
}

/**
 * Вспомогательный класс для управления очередью отрисовки компонентов:
 * можно добавить компонент в очередь на отрисовку, которая произойдёт
 * на следующий кадр, а также можно этот компонент удлаить из очереди, если
 * отрисовка была выполнена принудительно.
 * Решает проблему множественного создания таймеров на отрисовку: каждый
 * вызов `requestAnimationFrame` требует времени и ресурсов, а в контексте
 * огромного количества компонентов эта проблема возникает особенно остро.
 * С помощью этого таймера можно создаваьт всего один таймер на абсолютно
 * все компоненты
 */
var RenderQueue = function RenderQueue() {
	var this$1 = this;

	this._queue = new Set();
	this._scheduled = false;
	this._drain = function () {
		this$1._scheduled = false;
		var queue = new Set(this$1._queue);
		this$1._queue.clear();
		queue.forEach(function (component) { return component.render(true); });
	};
};

/**
	 * Добавляет элемент в очередь на отрисовку
	 * @param {HTMLElement} elem
	 */
RenderQueue.prototype.push = function push (elem) {
	this._queue.add(elem);
	if (!this._scheduled) {
		requestAnimationFrame(this._drain);
		this._scheduled = true;
	}
};

/**
	 * Удаляет элемент из очереди на отрисовку
	 * @param {HTMLElement} elem
	 */
RenderQueue.prototype.pop = function pop (elem) {
	this._queue.delete(elem);
};

/**
	 * Проверяет, есть ли указанный элемент в очереди на отрисовку
	 * @param {HTMLElement} elem
	 */
RenderQueue.prototype.queued = function queued (elem) {
	return this._queue.has(elem);
};

var reModelKey = /^(model\-key|key)$/i

/**
 * Считывает определение модели компонента из указанного DOM-узла
 * @param  {node} node
 * @return {Object}
 */
function definitionFromNode(node) {
	var model = {};

	for (var i = 0, il = node.childNodes.length, item, name; i < il; i++) {
		item = node.childNodes[i];
		if (item.nodeType === 1 && reModelKey.test(item.nodeName)) {
			name = item.getAttribute('name');
			if (!name) {
				throw new Error('Model key name cannot be empty');
			}

			model[name] = {
				type: item.getAttribute('type'),
				value: item.textContent
			};
		}
	}

	return model;
}

function readComponentModelData(component) {
	var data = {};
	for (var i = 0, il = component.attributes.length; i < il; i++) {
		var attr = component.attributes[i];
		data[attr.name] = 'objectValue' in attr ? attr.objectValue : attr.value;
		delete attr.objectValue;
	}

	return data;
}

var rq = new RenderQueue();

/**
 * Базовый компонент для всех компонентов OK.
 * Содержит набор методов и полифилов, необходимых для правильной работы
 * компонентов между различными браузерами.
 * Предполагается, что абсолютно все компоненты на сайте должны наследоваться
 * от него
 */
var BaseComponent = (function (HTMLElement) {
    function BaseComponent(_) {
        return (_ = HTMLElement.call(this, _))._init(), _;
    }

    if ( HTMLElement ) BaseComponent.__proto__ = HTMLElement;
    BaseComponent.prototype = Object.create( HTMLElement && HTMLElement.prototype );
    BaseComponent.prototype.constructor = BaseComponent;

    var prototypeAccessors = { template: {},modelDefinition: {},shadowDOM: {} };

    BaseComponent.prototype._init = function _init () {
        var this$1 = this;

        this.componentView = this.__production ? this : this.attachShadow({ mode: 'open' });

        var self = this;
        this.renderer = new TemplateContext(this.componentView, {
            state: function state(key) {
                return key != null ? self.state.get(key) : self.state.data;
            }
        });

        this._slots = new Map();

        /**
         * Флаг, указывающий на работу компонента в production-режиме.
         * Значение флага меняется при сборке компонента.
         * Флаг read-only
         * @type {Boolean}
         */
        // this.__production = false;
        this.model = new ComponentModel(this.modelDefinition, readComponentModelData(this));
        this.state = new DataModel();

        // Флаг, который указывает, что метод `getAttribute()` поддерживает
        // объекты в качестве значений атрибута. Этот флаг нужен для шаблонизатора,
        // чтобы при обновлении View компонента он использовал метод `getAttribute()`
        // при установке объектов-значений атрибута
        this.supportsObjectAttributes = true;

        // подписываемся на изменение данных
        this._isDirty = false;
        var render = function () { return this$1.markAsDirty(); };
        this.state.subscribe(render);
        this.model.subscribe(function (name, newVal, oldVal) {
            if (typeof this$1.attributeChangedCallback === 'function') {
                this$1.attributeChangedCallback(name, newVal, oldVal);
            }
            render();
        });

        this.init();

        if (typeof this.attributeChangedCallback === 'function') {
            this.model.keys().forEach(function (key) {
                var value = this$1.model.get(key);
                if (value != null) {
                    this$1.attributeChangedCallback(key, value, null);
                }
            });
        }

        render();
    };

    /**
     * Вызывается при создании класса. Переопределяйте его вместо `constructor()`!
     */
    BaseComponent.prototype.init = function init () {

    };

    prototypeAccessors.template.get = function () {
        var doc = document.currentScript && document.currentScript.ownerDocument || document;
        return doc.getElementById(this.nodeName.toLowerCase());
    };

    prototypeAccessors.modelDefinition.get = function () {
        var doc = document.currentScript && document.currentScript.ownerDocument || document;
        var elem = doc.getElementById(this.nodeName.toLowerCase() + '--model');
        return elem && definitionFromNode(elem.content);
    };

    /**
     * Указатель на контейнер для UI части компонента. В будущем имплементация
     * будет расширена поддержкой браузеров, которые не поддерживают Shadow DOM
     * @return {DocumentFragment}
     */
    prototypeAccessors.shadowDOM.get = function () {
        // console.warn('"shadowDOM" property is deprecated, use "componentOutput" instead');
        return this.componentView;
    };

    BaseComponent.prototype.markAsDirty = function markAsDirty () {
        if (!this._isDirty) {
            this._isDirty = true;
            this.render();
        }
    };

    BaseComponent.prototype.connectedCallback = function connectedCallback () {
        this._disposeEventListeners = attachEventListeners(this, this.constructor.events);
    };

    BaseComponent.prototype.disconnectedCallback = function disconnectedCallback () {
        if (this._disposeEventListeners) {
            // XXX: возможны повторные вызовы из-за ручной очистки содержимого при disconnectedCallback
            this._disposeEventListeners();
            delete this._disposeEventListeners;
        }
    };

    /////////////////////////////////////////////////////////
    // Переопределяем методы работы с атрибутами, чтобы можно
    // было передавать объекты в качестве значений
    // и использовать модель данных по умолчанию
    ////////////////////////////////////////////////////////

    BaseComponent.prototype.getAttribute = function getAttribute (name) {
        return this.model.get(name);
    };

    BaseComponent.prototype.setAttribute = function setAttribute (name, value) {
        if (this.model.set(name, value)) {
            // Получаем значение из модели, так как она делает приведение типов
            value = this.model.get(name);

            // Отразим данные в атрибуте компонента
            if (typeof value === 'object') {
                // записываем значение: нужно обновить индикатор значения
                var attr = this.attributes.getNamedItem(name);
                var m = (attr && attr.value || '').match(/^\.(\d+)$/);
                value = '.' + (m ? (Number(m[1]) + 1) : 1);
            }

            HTMLElement.prototype.setAttribute.call(this, name, value);
        }
    };

    BaseComponent.prototype.removeAttribute = function removeAttribute (name) {
        if (this.hasAttribute(name)) {
            HTMLElement.prototype.removeAttribute.call(this, name);
            this.model.delete(name);
        }
    };

    BaseComponent.prototype.getSlot = function getSlot (name) {
        name = name || null;
        if (!this._slots.has(name)) {
            this._slots.set(name, document.createElement('slot'));
        }

        return this._slots.get(name);
    };

    /**
     * Запуск отрисовки компонента. По умолчанию отрисовка откладывается на
     * следующий кадр, чтобы множество запросов на отрисовку при изменении
     * модели на тратились впустую, однако можно вызвать моментальную
     * отрисовку, передав аргумент `force`.
     *
     * Сам процесс отрисовки происходит в несколько этапов:
     * 1. Вызываем `willRender()` чтобы сообщить, что начинается отрисовка.
     *    Если метод вернёт `false` — отрисовка отменяется.
     * 2. Стандартная отрисовка: обновление DOM-содержимого компонента.
     * 3. Вызов метода `didRender()` как оповещение о завершении отрисовки.
     */
    BaseComponent.prototype.render = function render (force, slotFill) {
        if (slotFill) {
            // Передали объект с информацией о заполненности слотов
            // Обновим элементы
            this._slots.forEach(function (slot, name) {
                if (slotFill.get(name)) {
                    slot.setAttribute('slotted', 'slotted');
                } else {
                    slot.removeAttribute('slotted');
                }
            });
        }

        if (this._rendering) {
            return;
        }

        if (force) {
            this.markAsDirty();
            this._render();
        } else {
            // откладываем отрисовку на следующий кадр, чтобы множество
            // одновременных изменений модели каждый раз не генерировали отрисовку
            rq.push(this);
        }
    };

    /**
     * Проверяет, должен ли текущий компонент перерисоваться
     * TODO продумать и переделать методы жизненного цикла, слишком много похожих проверок
     * @return {Boolean}
     */
    BaseComponent.prototype.componentShouldRender = function componentShouldRender () {
        return this._isDirty;
    };

    BaseComponent.prototype._render = function _render () {
        if (!this.componentShouldRender()) {
            return;
        }

        this._rendering = true;
        rq.pop(this);

        try {
            var template = this.template;
            if (template && this.willRender() !== false) {
                this.renderer.render(template, this);
                this._isDirty = this._rendering = false;
                this.didRender();
            } else {
                this._isDirty = this._rendering = false;
            }
        } catch (error) {
            this._isDirty = this._rendering = false;
            if (!error.componentName) {
                error.message = "Error while rendering of " + (this.nodeName) + " component:\n" + (error.message);
                error.componentName = this.nodeName;
            }
            throw error;
        }
    };

    /**
     * Метод вызовется до непосредственной отрисовки компонента. Если этот метод
     * вернёт `false` — перерисовка компонента не будет выполнена.
     * @return {Boolean}
     */
    BaseComponent.prototype.willRender = function willRender () {
        return true;
    };

    /**
     * Метод вызывается после того, как была выполнена *стандартная* отрисовка
     * содержимого компонента. Метод не вызовается, если `willRender()` вернёт
     * `false`
     */
    BaseComponent.prototype.didRender = function didRender () {

    };

    /**
     * Костыль, который позволяет приявзать указанный элемент и его потомков
     * к скоупу стилей текущего компонента. Нужно оспользовать каждый раз, когда
     * добавляются элементы во View компонента не через шаблонизатор, а напрямую,
     * через DOM API
     * @param  {Node|Node[]} elem
     */
    BaseComponent.prototype.scopeStyle = function scopeStyle (elem) {
        var this$1 = this;

        if (!this.__production || !this.hash || !elem) {
            return;
        }

        if ('length' in elem) {
            // Обход массива или NodeList
            for (var i = 0, il = elem.length; i < il; i++) {
                this$1.scopeStyle(elem[i]);
            }
        } else if (elem.nodeType === 1) {
            elem.classList.add(("__" + (this.hash)));
            if (elem._slots) {
                elem._slots.forEach(function (slot) {
                    if (slot.hasAttribute('slotted')) {
                        this$1.scopeStyle(slot.childNodes);
                    }
                });
            } else {
                this.scopeStyle(elem.childNodes);
            }
        }
    };

    /**
     * Выпускает широковещательное событие: событие, которой будет вызвано на
     * каждом родительском веб-компоненте
     * @param {String} name Название события
     * @param {Object} detail Дополнительные данные для события
     */
    BaseComponent.prototype.emit = function emit (name, detail) {
        var evt = new CustomEvent(name, {
            bubbles: true,
            cancelable: true,
            composed: true, // выходим за пределы Shadow Root
            detail: detail
        });

        this.dispatchEvent(evt);
        return this;
    };

    BaseComponent.prototype.on = function on (name, callback, options) {
        this.componentView.addEventListener(name, callback, options);
        return this;
    };

    BaseComponent.prototype.off = function off (name, callback, options) {
        this.componentView.removeEventListener(name, callback, options);
        return this;
    };

    Object.defineProperties( BaseComponent.prototype, prototypeAccessors );

    return BaseComponent;
}(HTMLElement));

function attachEventListeners(component, events) {
    var listeners = Object.keys(events || []).map(function (key) {
        var parts = key.trim().split(/\s+/);
        var name = parts.shift();
        var selector = parts.join(' ').trim();

        var handler = events[key];
        if (typeof handler === 'string') {
            if (component[handler] !== 'function') {
                throw new Error(("Unable to attach event \"" + key + "\" to " + (component.nodeName) + " component: no \"" + handler + "\" method"));
            }
            handler = component[handler];
        }

        var listener = function(evt) {
            var ctx = selector ? evt.target.closest(selector) : this;
            // NB в production-режиме `.componentView` соответствует самому
            // компоненту. В этом случае перебрасываемые события (поймали событие
            // снизу, отменили его и послали новое с таким же типом) войдут
            // в бесконечный цикл. Поэтому глобальный хэндлер будем вызывать
            // только в том случае, если источником события не является сам
            // компонент.
            // FIXME возможно, есть более элегантное решение проблемы, подумать
            // об этом
            if (ctx && ctx !== evt.target) {
                handler.call(ctx, evt, component);
            }
        };

        component.on(name, listener);
        return [name, listener];
    });

    return function () { return listeners.forEach(function (obj) { return component.off(obj[0], obj[1]); }); };
}

var waitBailOutTimeout = 15000;

/**
 * Вспомогательная функция для создания Custom Element, основанного на
 * базовом классе веб-компонентов.
 *
 * @example
 * import defineComponent from 'ok-web-components';
 * defineComponent('my-component', BaseClass => class extends BaseClass { ... });
 *
 * @param {Stirng} name Название тэга для кастомного элемента
 * @param {String[]} [deps] Список кастомных тэгов, чьи определения нужно дождаться
 * прежде, чем опредетить текущий элемент
 * @param {Function} factory Функция-фабрика, которая должна вернуть класс для
 * кастомного элемента. В качестве аргумента функция принимает класс базового
 * веб-компонента, от которого может наследоваться
 * @return {Promise} Промис, который резолвится после того, как определение
 * элемента было создано
 */
function defineComponent(name, deps, factory) {
	if (typeof deps === 'string' || deps == null) {
		// вызвали как defineComponent('my-component');
		factory = defaultFactory;
		deps = [];
	}

	if (typeof deps === 'function') {
		// вызвали как defineComponent('my-component', factory() {...});
		factory = deps;
		deps = [];
	}

	return new Promise(function (resolve, reject) {
		if (!deps || !deps.length) {
			define(name, factory);
			return resolve();
		}

		var timeout = setTimeout(function () {
			var err = new Error(("Не удалось дождаться определений элементов " + (deps.join(', ')) + ": время ожидания истекло"));
			err.code = 'EELEMENTTIMEOUT';
			reject(err);
		}, waitBailOutTimeout);

		Promise.all(deps.map(function (name) { return customElements.whenDefined(name); }))
		.then(function () {
			define(name, factory, deps.map(function (name) { return customElements.get(name); }));
			clearTimeout(timeout);
			resolve();
		});
	});
}

/**
 * Функция определения компонента
 * @param  {String}  name        Название компонента
 * @param  {Funtion} factory     Функция-фабрика создания компонента
 */
function define(name, factory, deps) {
	var ElemClass = factory(BaseComponent, deps || []);
	customElements.define(name, ElemClass);
}

function defaultFactory(BaseClass) {
	return (function (BaseClass) {
		function anonymous () {
			BaseClass.apply(this, arguments);
		}if ( BaseClass ) anonymous.__proto__ = BaseClass;
		anonymous.prototype = Object.create( BaseClass && BaseClass.prototype );
		anonymous.prototype.constructor = anonymous;

		

		return anonymous;
	}(BaseClass));
}

defineComponent.BaseComponent = BaseComponent;

return defineComponent;

}());
//# sourceMappingURL=web-component.min.3153292629.js.map
