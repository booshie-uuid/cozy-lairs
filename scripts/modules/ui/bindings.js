const ko = window.ko;


/******************************************************************************/
/* BINDINGS                                                                   */
/******************************************************************************/

// `fadeOut` toggles the `is-faded` class — the transition itself lives in CSS.
ko.bindingHandlers.fadeOut =
{
    update(element, valueAccessor)
    {
        const faded = ko.unwrap(valueAccessor());
        element.classList.toggle("is-faded", !!faded);
    }
};
