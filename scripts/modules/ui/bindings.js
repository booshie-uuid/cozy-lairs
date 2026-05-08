const ko = window.ko;


/******************************************************************************/
/* BINDINGS                                                                   */
/******************************************************************************/

/*
 * All `ko.bindingHandlers.*` registrations live here. Import once for side
 * effects before `ko.applyBindings`.
 */


/* fadeOut: toggles `is-faded` class — transition lives in CSS. */
ko.bindingHandlers.fadeOut =
{
    update(element, valueAccessor)
    {
        const faded = ko.unwrap(valueAccessor());
        element.classList.toggle("is-faded", !!faded);
    }
};
