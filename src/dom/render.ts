import { VirtualElement, ElementChild, ElementProps } from '../core/types';
import { registerEventHandler, removeEventHandler, updateEventHandler, attachDirectListener, removeDirectListener } from '../events/handler';
import { globalStore } from '../state/store';
import { generateId } from '../utils/id';
import { startTracking, stopTracking, Unsubscribe } from '../utils/observable';

// Liste des événements non-bubbling qui nécessitent un attachement direct
const NON_BUBBLING_EVENTS = ['scroll', 'resize', 'load', 'focus', 'blur'];

// -------------- Types & Interfaces --------------

// Type pour une fonction qui crée un élément virtuel
type ComponentFunction = () => VirtualElement;

// Structure pour les enfants avec et sans clés
interface KeyedChildren {
    withKeys: Array<{ key: string; child: ElementChild; index: number }>;
    withoutKeys: Array<{ child: ElementChild; index: number }>;
}

// ------------------------------------------------

// ------------- Fonctions utilitaires -------------

// Convertir camelCase en kebab-case
function camelToKebab(str: string): string {
    if (!str) return '';

    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

// Convertir un tableau de classes en string
function classArrayToString(classes: (string | undefined | null | false)[]): string {
    if (!classes) return '';

    return classes.filter(Boolean).join(' ');
}

// Convertir un objet style en string CSS
function styleObjectToString(styleObj: Record<string, string | number>): string {
    if (!styleObj) return '';

    const styles = Object.entries(styleObj).map(([key, value]) => {
        return `${camelToKebab(key)}: ${value}`;
    });
    return styles.join('; ');
}

// Fonction pour appliquer un seul prop à un élément HTML
function applySingleProp(element: HTMLElement, key: string, value: any): void {
    if (key.startsWith('on')) {
        const eventType = key.slice(2).toLowerCase();
        const id = element.id || '';
        if (!id) {
            element.id = generateId();
        }
        const eventId = registerEventHandler(eventType, value);
        element.dataset[`event${eventType.charAt(0).toUpperCase() + eventType.slice(1)}Id`] = eventId;

        // Pour les événements non-bubbling, attacher directement au lieu d'utiliser la délégation
        if (NON_BUBBLING_EVENTS.includes(eventType)) {
            attachDirectListener(element, eventType, eventId);
        }
    } else if (key === 'style' && typeof value === 'object' && value !== null) {
        element.setAttribute('style', styleObjectToString(value as Record<string, string | number>));
    } else if (key === 'class' && Array.isArray(value)) {
        element.setAttribute('class', classArrayToString(value as (string | undefined | null | false)[]));
    } else if (key === 'checked' || key === 'selected' || key === 'disabled') {
        if (value) {
            element.setAttribute(key, key);
        } else {
            element.removeAttribute(key);
        }
    } else if (key === 'value' && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT')) {
        (element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value = String(value);
    } else {
        element.setAttribute(key, String(value));
    }
}

// Fonction pour appliquer les props à un élément HTML
function applyProps(element: HTMLElement, props: ElementProps): void {
    for (const [key, value] of Object.entries(props)) {
        applySingleProp(element, key, value);
    }
}

// Fonction pour ajouter un enfant à un élément
function appendChild(parent: HTMLElement, child: ElementChild): void {
    if (child === null || child === undefined) return;
    
    if (typeof child === 'string' || typeof child === 'number') {
        const textNode = document.createTextNode(String(child));
        parent.appendChild(textNode);
        return;
    }
    
    if (child instanceof Object && 'tag' in child) {
        const childElement = createDOMElement(child);
        parent.appendChild(childElement);
        return;
    }
}

// Fonction pour comparer et patcher deux Virtual DOM
export function diffAndPatch(domNode: HTMLElement, oldVNode: VirtualElement, newVNode: VirtualElement, strategy?: DiffStrategy): void {
    // Vérifier si les deux sont mémorisés avec la même clé
    if (oldVNode.__memoized && newVNode.__memoized && 
        oldVNode.__memoKey === newVNode.__memoKey) {
        return; // Pas de changement, skip le diff
    }

    // Si les tags sont différents (remplacement complet)
    if (oldVNode.tag !== newVNode.tag) {
        const newElement = createDOMElement(newVNode);
        if (domNode.parentNode && newElement) {
            domNode.parentNode.replaceChild(newElement, domNode);
        }
        return;
    }

    // Même tag (mise à jour)
    diffProps(domNode, oldVNode.props, newVNode.props);
    diffChildren(domNode, oldVNode.children, newVNode.children, strategy);
}

// Fonction pour comparer les props de deux éléments
function diffProps(domNode: HTMLElement, oldProps: ElementProps, newProps: ElementProps): void {
    // 1. Supprimer les props qui n'existent plus
    for (const key in oldProps) {
        if (!(key in newProps)) {
            if (key.startsWith('on')) {
                // Supprimer l'événement spécifique
                const eventType = key.slice(2).toLowerCase();
                const eventIdKey = `event${eventType.charAt(0).toUpperCase() + eventType.slice(1)}Id`;
                const eventId = domNode.dataset[eventIdKey];
                if (eventId) {
                    removeEventHandler(eventId);
                    delete domNode.dataset[eventIdKey];

                    // Pour les événements non-bubbling, supprimer également le listener direct
                    if (NON_BUBBLING_EVENTS.includes(eventType)) {
                        removeDirectListener(domNode, eventType);
                    }
                }
            } else {
                domNode.removeAttribute(key);
            }
        }
    }
    // 2. Ajouter/modifier les nouvelles props
    for (const key in newProps) {
        const newValue = newProps[key];
        const oldValue = oldProps[key];
        
        if (key.startsWith('on')) {
            // Pour les événements : toujours mettre à jour le handler
            const eventType = key.slice(2).toLowerCase();
            const eventIdKey = `event${eventType.charAt(0).toUpperCase() + eventType.slice(1)}Id`;
            const existingEventId = domNode.dataset[eventIdKey];

            if (existingEventId) {
                // Mettre à jour le handler existant au lieu de le recréer
                updateEventHandler(existingEventId, newValue);
            } else {
                // Créer un nouveau handler
                applySingleProp(domNode, key, newValue);
            }
        } else if (newValue !== oldValue) {
            // Pour les autres props : comparer normalement
            applySingleProp(domNode, key, newValue);
        }
    }
}

// Fonction pour créer un noeud DOM depuis un enfant virtuel
function createDomChild(child: ElementChild): Node {
    if (typeof child === 'string' || typeof child === 'number') {
        return document.createTextNode(String(child));
    } else if (child && typeof child === 'object' && 'tag' in child) {
        return createDOMElement(child);
    }

    return document.createTextNode('');
}

// Fonction pour mettre à jour un enfant existant
function updateChild(parent: HTMLElement, domChild: ChildNode, oldChild: ElementChild, newChild: ElementChild): void {
    // Même type de contenu texte
    if ((typeof oldChild === 'string' || typeof oldChild === 'number') && 
        (typeof newChild === 'string' || typeof newChild === 'number')) {
        if (String(oldChild) !== String(newChild)) {
            domChild.textContent = String(newChild);
        }
    }
    // Deux éléments virtuels
    else if (oldChild && typeof oldChild === 'object' && 'tag' in oldChild &&
             newChild && typeof newChild === 'object' && 'tag' in newChild) {
        diffAndPatch(domChild as HTMLElement, oldChild, newChild);
    }
    // Types différents - remplacement complet
    else {
        const newDomChild = createDomChild(newChild);
        parent.replaceChild(newDomChild, domChild);
    }
}

// Séparer les enfants avec et sans keys
function extractKeyedChildren(children: ElementChild[]): KeyedChildren {
    const withKeys: Array<{ key: string; child: ElementChild; index: number }> = [];
    const withoutKeys: Array<{ child: ElementChild; index: number }> = [];
    
    children.forEach((child, index) => {
        if (child && typeof child === 'object' && 'props' in child && child.props.key !== undefined) {
            withKeys.push({ key: String(child.props.key), child, index });
        } else {
            withoutKeys.push({ child, index });
        }
    });
    
    return { withKeys, withoutKeys };
}

// Diff avec gestion des keys
function diffChildrenWithKeys(
    domNode: HTMLElement,
    oldKeyed: KeyedChildren,
    newKeyed: KeyedChildren
): void {
    const childSnapshot = Array.from(domNode.childNodes);
    const oldKeyMap = new Map<string, { child: ElementChild; ref: ChildNode }>();
    oldKeyed.withKeys.forEach(({ key, child, index }) => {
        oldKeyMap.set(key, { child, ref: childSnapshot[index] });
    });

    const newKeySet = new Set(newKeyed.withKeys.map(({ key }) => key));
    const usedRefs = new Set<ChildNode>();
    let insertionIndex = 0;

    newKeyed.withKeys.forEach(({ key, child: newChild }) => {
        const oldItem = oldKeyMap.get(key);

        if (oldItem && !usedRefs.has(oldItem.ref)) {
            if (typeof oldItem.child === 'object' && typeof newChild === 'object' &&
                oldItem.child && 'tag' in oldItem.child && newChild && 'tag' in newChild) {
                updateChild(domNode, oldItem.ref, oldItem.child, newChild);
            }
            const anchor = domNode.childNodes[insertionIndex];
            if (anchor && anchor !== oldItem.ref) {
                domNode.insertBefore(oldItem.ref, anchor);
            } else if (!anchor) {
                domNode.appendChild(oldItem.ref);
            }
            usedRefs.add(oldItem.ref);
        } else {
            const newDomChild = createDomChild(newChild);
            const anchor = domNode.childNodes[insertionIndex];
            if (anchor) {
                domNode.insertBefore(newDomChild, anchor);
            } else {
                domNode.appendChild(newDomChild);
            }
        }

        insertionIndex++;
    });

    newKeyed.withoutKeys.forEach(({ child: newChild }) => {
        const newDomChild = createDomChild(newChild);
        const anchor = domNode.childNodes[insertionIndex];
        if (anchor) {
            domNode.insertBefore(newDomChild, anchor);
        } else {
            domNode.appendChild(newDomChild);
        }
        insertionIndex++;
    });

    // Remove old-keyed nodes whose key is absent from the new list
    oldKeyMap.forEach((item, key) => {
        if (!newKeySet.has(key)) {
            item.ref.parentNode?.removeChild(item.ref);
        }
    });

    // Remove any excess unkeyed tail nodes
    while (domNode.childNodes.length > insertionIndex) {
        domNode.removeChild(domNode.lastChild!);
    }
}

// Fallback sans keys (votre algorithme actuel)
function diffChildrenByIndex(domNode: HTMLElement, oldChildren: ElementChild[], newChildren: ElementChild[]): void {
    const maxLength = Math.max(oldChildren.length, newChildren.length);

    const childSnapshot = Array.from(domNode.childNodes);
    for (let i = 0; i < maxLength; i++) {
        const oldChild = oldChildren[i];
        const newChild = newChildren[i];
        const domChild = childSnapshot[i];

        if (newChild === undefined || newChild === null) {
            if (domChild) {
                domNode.removeChild(domChild);
            }
        } else if (oldChild === undefined || oldChild === null) {
            const newDomChild = createDomChild(newChild);
            domNode.appendChild(newDomChild);
        } else {
            updateChild(domNode, domChild, oldChild, newChild);
        }
    }
}

export type DiffStrategy = (domNode: HTMLElement, old: ElementChild[], next: ElementChild[]) => void;

function keyedStrategy(domNode: HTMLElement, old: ElementChild[], next: ElementChild[]): void {
    diffChildrenWithKeys(domNode, extractKeyedChildren(old), extractKeyedChildren(next));
}

export function selectStrategy(old: ElementChild[], next: ElementChild[]): DiffStrategy {
    const oldKeyed = extractKeyedChildren(old);
    const newKeyed = extractKeyedChildren(next);

    if (oldKeyed.withKeys.length === 0 && newKeyed.withKeys.length === 0) {
        return diffChildrenByIndex;
    }

    return keyedStrategy;
}

function diffChildren(domNode: HTMLElement, oldChildren: ElementChild[], newChildren: ElementChild[], strategy?: DiffStrategy): void {
    const fn = strategy ?? selectStrategy(oldChildren, newChildren);
    fn(domNode, oldChildren, newChildren);
}

// -------------------------------------------------

// Fonction pour rendre un élément virtuel dans un conteneur
export function renderElement(element: VirtualElement, container: HTMLElement): void {
    container.innerHTML = '';
    const domElement = createDOMElement(element);
    container.appendChild(domElement);
}

// Observer pattern: each render root gets its own Renderer instance keyed by container.
class Renderer {
    private lastVirtualDOM: VirtualElement | null = null;
    private unsubscribes: Unsubscribe[] = [];
    private isRerendering = false;

    constructor(
        private readonly component: ComponentFunction,
        private readonly container: HTMLElement,
    ) {}

    mount(): void {
        this.performRender();
    }

    private performRender(): void {
        if (this.isRerendering) return;
        this.isRerendering = true;

        startTracking();
        const currentVDOM = this.component();
        const paths = stopTracking();

        if (this.lastVirtualDOM) {
            const existing = this.container.firstElementChild as HTMLElement | null;
            if (existing) {
                diffAndPatch(existing, this.lastVirtualDOM, currentVDOM);
            } else {
                renderElement(currentVDOM, this.container);
            }
        } else {
            renderElement(currentVDOM, this.container);
        }

        this.lastVirtualDOM = currentVDOM;

        this.clearSubscriptions();
        paths.forEach(path => {
            this.unsubscribes.push(
                globalStore.subscribeTo(path, () => this.performRender())
            );
        });

        this.isRerendering = false;
    }

    private clearSubscriptions(): void {
        this.unsubscribes.forEach(u => u());
        this.unsubscribes = [];
    }

    destroy(): void {
        this.clearSubscriptions();
        renderers.delete(this.container);
    }
}

const renderers = new Map<HTMLElement, Renderer>();

export function render(createComponent: ComponentFunction, container: HTMLElement): void;
export function render(element: VirtualElement, container: HTMLElement): void;
export function render(
    elementOrFunction: VirtualElement | ComponentFunction,
    container: HTMLElement
): void {
    if (typeof elementOrFunction === 'function') {
        renderers.get(container)?.destroy();
        const renderer = new Renderer(elementOrFunction, container);
        renderers.set(container, renderer);
        renderer.mount();
    } else {
        renderElement(elementOrFunction, container);
    }
}

export function destroyRenderer(container: HTMLElement): void {
    renderers.get(container)?.destroy();
}

export function createDOMElement(vElement: VirtualElement): HTMLElement {
    const element = document.createElement(vElement.tag);
    applyProps(element, vElement.props);
    vElement.children.forEach(child => appendChild(element, child));
    return element;
}