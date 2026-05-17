const ko = window.ko;


/******************************************************************************/
/* CONFIRM MODAL VIEW MODEL                                                   */
/******************************************************************************/

// Reentrant `show()` drops the previous onConfirm — "open one, decide on
// the new one" matches the user's mental model.

class ConfirmModalViewModel
{
    constructor()
    {
        this.visible     = ko.observable(false);
        this.title       = ko.observable("");
        this.message     = ko.observable("");
        this.actionLabel = ko.observable("Confirm");

        this.pendingConfirm = null;
    }

    show({ title, message, actionLabel, onConfirm })
    {
        this.title(title || "");
        this.message(message || "");
        this.actionLabel(actionLabel || "Confirm");
        this.pendingConfirm = (typeof onConfirm === "function") ? onConfirm : null;
        this.visible(true);
    }

    confirm()
    {
        const fn = this.pendingConfirm;
        this.hide();
        if(fn) { fn(); }
    }

    cancel()
    {
        this.hide();
    }

    hide()
    {
        this.visible(false);
        this.pendingConfirm = null;
    }
}


export { ConfirmModalViewModel };
