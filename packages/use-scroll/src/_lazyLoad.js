/**
 * Модуль LazyLoad.
 * @requires tools/layout.js
 * Created by a.koperskiy on 03.09.15.
 */
// TODO: 1. Перенести getClientRect из функции _getOutdent в setDirty. Первая выполняется в AF,
// и getClientRect приводит к ненужному reflow.
// TODO: 2. Функция для добавления lazy-элементов в плагинах.
(function ($, window, cpf) {
    const layout = cpf.Tools.Layout;
    const { debounce } = cpf.Basic;

    const defOpts = {
        cssSels: {
            lazy: '.js-lazy',
            Main: {
                // Элемент, на котором устанавливается скролл. Если не указан, на body.
                viewport: null,
                // Элемент, представляющий прокурчиваемый контен. Используется для получения
                // ширины контента. Задвать нужно, если ширину невозможно получить из свойств
                // scrollWidth/scrollHeight вьюпорта (как в случае со слайдером, эмулирующим скролл).
                content: null,
            },
        },
        cssClss: {
            lazy: 'js-lazy',
            pending: 'js-lazy-pending',
            complete: 'js-lazy-complete',
        },
        srcAttr: 'data-src',
        precede: 0,				// количество экранов предварительной загрузки
        immediate: false,		// показывать lazy-элемент сразу после загруски (не ждать вхождение во вьюпорт)
    };

    const modulePrototype = {
        /**
		 * Основная инициализация, которая не должна переопределяться в плагинах.
		 * @private
		 */
        _Init() {
            const elems = this._elems;

            this._viewport = elems.viewport
                ? elems.viewport.get(0)
                : document.body;

            this._content = elems.content
                ? elems.content.get(0)
                : this._viewport;

            this._state = {};
            this.setDirty = debounce(this.setDirty.bind(this), 30);	// чтобы DOM успел успокоиться
            this.onScroll = this.onScroll.bind(this);
            this.init.apply(this, arguments);
        },
        /**
		 * Кеширует ссылку на вьюпорт, подключает обработчики.
		 * Эта часть может переопределяться и дополняться в плагинах.
		 * @listens ready
		 */
        init() {
            const vp = this._elems.viewport;

            this.setDirty();

            if (vp && vp.length) {
                vp.on('scroll', this.onScroll);
            }
            $(window).on('scroll', this.onScroll).on('resize', this.setDirty);
        },
        /**
		 * Положение элементов относительно вьюпорт и зоны предзагрузки
		 */
        VIEW_STATE: {
            out: 0,				// за пределами зоны слежения
            precedeEnter: 1,	// вошел в зону предзагрузки
            precedeMove: 2,		// движется по зоне предзагрузки
            precedeLeave: 3,	// покинул зону предзагрузки
            viewportEnter: 4,	// вошел во вьюпорт
            viewportMove: 8,	// движется по вьюпорту
            viewportLeave: 12,	// покинул вьюпорт
        },
        /**
		 * Отключает обработчики, кормит GC.
		 */
        destroy() {
            $(window).off('scroll', this.onScroll).off('resize', this.setDirty);
            delete this._state;
        },
        /**
		 * @private
		 */
        _requestAF(fn) {
            if (!this._pendingAF) {
                window.requestAnimationFrame(() => {
                    fn.apply(this);
                    this._pendingAF = false;
                });
                this._pendingAF = true;
            }
        },
        /**
		 * Обрабатывает событие скролла.
		 * @listens scroll
		 */
        onScroll(e) {
            if (this._state.dirty) {
                this._recalcLazyElems();
            }
            this._requestAF(this._checkLazyElems);
        },
        /**
		 * Возвращает скролл вьюпорта. Может переопределяться в плагинах,
		 * например если надо эмулировать скролл, как при горизонтальной прокрутке слайдера.
		 * @returns {{top: number, left: number}|*}
		 */
        getScroll() {
            return layout.getScroll(this._viewport);
        },
        /**
		 * Устанавливает исходное состояние в соответсвии с геометрией окна. Состояние включает:
		 *  {boolean} dirty Признак исходного состояния (true).
		 *  {number} winWidth Высота окна.
		 *  {number} winHeight Ширина окна.
		 *  {Array} lazyElems Массив DOM-элементов для ленивой загрузки.
		 *  {Array} metrics Массив, в котором для каждого lazy-элемента содержатся значения скрола.
		 *  {number} metrics.widthIn Скролл, при котором элемент входит во вьюпорт по горизонтали.
		 *  {number} metrics.widthOut ...выходит из вьюпорта по горизонтали.
		 *  {number} metrics.heightIn Скролл, при котором элемент входит во вьюпорт по вертикали.
		 *  {number} metrics.heightOut ...выходит из вьюпорта по вертикали.
		 *  {jQuery} metrics.elem
		 *  {Object} vpRect Метрики вьюпорта (элемент – владельца скрола).
		 *  {number} vpRect.scrollWidth  Максимальный скролл по ширине.
		 *  {number} vpRect.scrollHeight Максимальный скролл по высоте.
		 *  {number} vpRect.precedWidth Велична зоны предворительной загрузки по ширине.
		 *  {number} vpRect.precedHeight Велична зоны предворительной загрузки по высоте.
		 *  {number} vpRect.outLeft Отступ от края окна до вьюпорта слева.
		 *  {number} vpRect.outRight Отступ от края окна до вьюпорта справа.
		 *  {number} vpRect.outTop Отступ от края окна до вьюпорта сверху.
		 *  {number} vpRect.outBottom Отступ от края окна до вьюпорта снизу.
		 */
        setDirty() {
            const sels = this._opts.cssSels;
            const state = this._state;
            const content = this._content;
            const { parent } = this._elems;

            const winWidth = window.innerWidth;
            const winHeight = window.innerHeight;
            const { precede } = this._opts;

            const viewport = this._viewport;
            const vpRect = viewport === document.body
                ? {
                    top: 0, left: 0, width: winWidth, height: winHeight,
                }
                : layout.getClientRect(viewport);

            state.dirty = true;
            state.winWidth = winWidth;
            state.winHeight = winHeight;
            state.metrics = [];
            state.lazyElems = parent.find(sels.lazy).get();
            state.vpRect = vpRect;

            // Максимальный скролл по ширине и высоте
            vpRect.scrollWidth = content.scrollWidth;
            vpRect.scrollHeight = content.scrollHeight;

            // Величина зоны превентивной загрузки
            vpRect.precedWidth = precede * vpRect.width;
            vpRect.precedHeight = precede * vpRect.height;

            // Пересчитать метрики
            this._recalcLazyElems();

            // Инвалидация кеша lazy-элементов по таймеру
            window.clearTimeout(this._invTm);
            this._invTm = window.setTimeout(this.setDirty.bind(this), 300000);
        },
        /**
		 * Рассчитывает значение скрола, при котором lazy-элементы находятся в вьюпорте.
		 * По каждой оси рассчитываются минимальный (in) и максимальный (out) скролл.
		 * @private
		 */
        _recalcLazyElems() {
            const state = this._state;
            const vp = state.vpRect;
            const scroll = this.getScroll();
            let elems = state.lazyElems.splice(0, 50);

            // Обработка порциями по 50 элементов. Если после прохода остаются элементы,
            // ставится таймер на продолжение. Продолжение также происходит при скроле.
            window.clearTimeout(this._recalcTm);
            if (state.lazyElems.length) {
                this._recalcTm = window.setTimeout(this._recalcLazyElems.bind(this), 30);
            } else {
                state.dirty = false;
            }
            elems = elems.map((elem) => {
                const rect = layout.getClientRect(elem);
                // Расстояния элемента от границы вьюпорта
                const left = rect.left - vp.left;
                const right = left + rect.width;
                const top = rect.top - vp.top;
                const bottom = top + rect.height;

                // Диапазоны скрола вьюпорта, при которых элемент хотя бы частично виден во вьюпорте
                rect.widthIn = left - vp.width + scroll.left;
                rect.widthOut = right + scroll.left;
                rect.heightIn = top - vp.height + scroll.top;
                rect.heightOut = bottom + scroll.top;
                rect.state = 0;
                rect.elem = $(elem);
                return rect;
            });
            state.metrics = state.metrics.concat(elems);
            this._requestAF(this._checkLazyElems);
        },
        /**
		 * Перебирает закешированные lazy-элементы в поисках вошедших во вьюпорт
		 * и в зону предварительной загрузки. Вызывает соответствующие обработчики.
		 * @private
		 */
        _checkLazyElems() {
            const state = this._state;
            const vp = state.vpRect;
            const scroll = this.getScroll();

            // Заступы вьюпорта за границы окна
            const outdent = this._getOutdent();

            state.metrics = state.metrics && state.metrics.filter(function (item) {
                const vst = this.VIEW_STATE;
                const proportion = {};

                // Хотя бы один размер должен присутствовать, иначе это скрытый элемент
                if (item.width || item.height) {
                    // Скорректировать границы скрола с учетом заступов вьюпорта за границы окна
                    const widthIn = item.widthIn - outdent.right;
                    const widthOut = item.widthOut + outdent.left;
                    const heightIn = item.heightIn - outdent.bottom;
                    const heightOut = item.heightOut + outdent.top;

                    const isVisible = scroll.left >= widthIn && scroll.left <= widthOut
						&& scroll.top >= heightIn && scroll.top <= heightOut;

                    const isPrecede = isVisible
						|| (scroll.left + vp.precedWidth) >= widthIn
						&& (scroll.left - vp.precedWidth) <= widthOut
						&& (scroll.top + vp.precedHeight) >= heightIn
						&& (scroll.top - vp.precedHeight) <= heightOut;

                    if (isVisible || isPrecede && widthOut !== widthIn && heightOut !== heightIn) {
                        // Пропорция - насколько элемент находится в окне (от 0 при вхождении, до 1 при выходе)
                        proportion.x = (scroll.left - widthIn) / (widthOut - widthIn);
                        proportion.y = (scroll.top - heightIn) / (heightOut - heightIn);
                        proportion.x = Math.max(0, Math.min(1, proportion.x));
                        proportion.y = Math.max(0, Math.min(1, proportion.y));
                    }

                    // Вхождение во вьюпорт
                    if (isVisible) {
                        const fromPrecede = item.state & vst.precedeMove
							|| item.state & vst.precedeEnter;

                        item.state = item.state & vst.viewportEnter
                            ? vst.viewportMove
                            : vst.viewportEnter;

                        if (fromPrecede) {
                            item.state |= vst.precedeLeave;
                        }
                        return fromPrecede
                            ? this.precedeLeave(item) && this.display(item, proportion)
                            : this.display(item, proportion);

                        // Вхождение в зону предзагрузки
                    } if (isPrecede) {
                        const fromViewport = item.state & vst.viewportMove
							|| item.state & vst.viewportEnter;

                        const handler = this._opts.immediate
                            ? this.display.bind(this)		// при включенной опции immediate будет вызван display
                            : this.preload.bind(this);		// при выключенной - preload

                        item.state = item.state & vst.precedeEnter
                            ? vst.precedeMove
                            : vst.precedeEnter;

                        if (fromViewport) {
                            item.state |= vst.viewportLeave;
                        }
                        return fromViewport
                            ? this.viewportLeave(item) && handler(item, proportion)
                            : handler(item, proportion);

                        // Покидание зоны предзагрузки
                    } if (item.state & vst.precedeMove) {
                        item.state = vst.precedeLeave;
                        return this.precedeLeave(item);
                    }
                }
                item.state = vst.out;
                return true;
            }, this);
        },
        /**
		 * Обрабатывает покидание зоны предзагрузки. Может переопределяться в плагинах.
		 * @param item
		 * @returns {boolean}
		 */
        precedeLeave(item) {
            return true;
        },
        /**
		 * Обрабатывает покидание вьюпорта. Может переопределяться в плагинах.
		 * @param item
		 * @returns {boolean}
		 */
        viewportLeave(item) {
            return true;
        },
        /**
		 * Вычисляет заступы вьюпорта за границы окна
		 * @returns {{left: number, right: number, top: number, bottom: number}}
		 * @private
		 */
        _getOutdent() {
            const state = this._state;
            let outdent = {
                left: 0, right: 0, top: 0, bottom: 0,
            };
            let rect;

            if (this._viewport !== document.body) {
                rect = layout.getClientRect(this._viewport);
                outdent = {
                    left: Math.min(0, rect.left),
                    right: Math.min(0, state.winWidth - rect.left - rect.width),
                    top: Math.min(0, rect.top),
                    bottom: Math.min(0, state.winHeight - rect.top - rect.height),
                };
            }
            return outdent;
        },
        /**
		 * Предварительно загружает содержимое элемента.
		 * @param {jQuery} elem
		 * @private
		 */
        preload(item) {
            const { srcAttr } = this._opts;
            const clss = this._opts.cssClss;
            const { elem } = item;
            let src; let
                img;

            if (elem.hasClass(clss.pending)) {
                return true;
            }
            elem.addClass(clss.pending);
            switch (elem.get(0).tagName) {
            case 'IMG':
                    if (src = elem.attr(srcAttr)) {
                        img = new Image();
                        img.src = src;
                }
            }
            return true;
        },
        /**
		 * Показывает элемент.
		 * @param {Object} item Метрики элемента.
		 * @private
		 */
        display(item) {
            const { srcAttr } = this._opts;
            const { elem } = item;
            let src;

            switch (elem.get(0).tagName) {
            case 'IMG':
                    if (src = elem.attr(srcAttr)) {
                    elem.attr('src', src)
                        .removeAttr(srcAttr)
                            .one('load error', this.done(item));
                    }
            }
        },
        /**
		 * Устанавливает классы после загрузки элемента. Вызывает проверку изменения размеров.
		 * @param item
		 * @returns {function(this:modulePrototype)}
		 */
        done(item) {
            const clss = this._opts.cssClss;
            return function () {
                item.elem.addClass(clss.complete).removeClass(clss.pending).removeClass(clss.lazy);
                this._checkElemSize(item);
            }.bind(this);
        },
        /**
		 * !Не используется, но есть такой вариант!
		 * Проверяет максимальные размеры скрола вьюпорта после отображения lazy-элемента.
		 * Если размеры изменились, переинициализирует метрики.
		 * @private
		 */
        _checkVPSize() {
            const { vpRect } = this._state;
            const viewport = this._viewport;
            const scrollWidth = viewport.scrollWidth - viewport.offsetWidth;
            const scrollHeight = viewport.scrollHeight - viewport.offsetHeight;

            if (scrollWidth !== vpRect.scrollWidth || scrollHeight !== vpRect.scrollHeight) {
                $(window).trigger('resize');
            }
        },
        /**
		 * Проверяет размеры элемента после загрузки. Если они изменились, инициирует пересчет метрик.
		 * @param {Object} item Элемент и его метрики.
		 * @private
		 */
        _checkElemSize(item) {
            const rect = layout.getClientRect(item.elem);

            if (rect.width !== item.width || rect.height !== item.height) {
                $(window).trigger('resize');
            }
        },
    };

    cpf.Basic.Extend(true, cpf, {
        Modules: {
            LazyLoad: cpf.Basic.Constructors.getView(modulePrototype, defOpts, null, 'LazyLoad'),
        },
    });
}(this.jQuery || this.$ || this.$f, this, this.ru.mail.cpf));
