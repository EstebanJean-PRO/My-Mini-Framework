import { createDOMElement } from '../../src/dom/render';
import {
    ReactiveComponent,

    div,
    a,
    input,
    ul,
    li,
    button,
    span,
    label,

    VirtualElement,

    globalStore,
    setState,
    setBatchedState,
    getState,

    generateId,
    memoizeReactiveComponent,
    useCallback,
    registerLazyRoute,
    navigateToLazy,
    preloadRoute,
    enableHoverPreloading,
    enableIdlePreloading
} from '../../src/index';

// ------------- Types pour TodoMVC -------------

interface Todo {
    id: string;
    text: string;
    completed: boolean;
}

function todoEqual(a: Todo | undefined, b: Todo | undefined): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.id === b.id && a.text === b.text && a.completed === b.completed;
}

type Filter = 'all' | 'active' | 'completed';

interface TodoState {
    todos: Todo[];
    filter: Filter;
    editingId: string | null;
}

// État initial
setState<TodoState>({
    todos: [],
    filter: 'all',
    editingId: null
});

// Composant TodoItem réactif
class TodoItemComponent extends ReactiveComponent {
    private todoId: string;

    constructor(todoId: string) {
        const todos = getCurrentState().todos;
        const todoIndex = todos.findIndex(t => t.id === todoId);

        // Determine paths and call super first
        const paths = todoIndex === -1 ? [`todos`] : [
            `todos[${todoIndex}].text`,
            `todos[${todoIndex}].completed`,
            'editingId'
        ];

        super(
            paths,
            (props) => this.renderTodo(props),
            { todoId },
            (newValue: any, oldValue: any, path: string) => {
                if (!oldValue) return true; // Premier rendu

                // Si le chemin est 'todos', on a la liste complète
                if (path === 'todos') {
                    const newTodos = newValue as Todo[];
                    const oldTodos = oldValue as Todo[];
                    const newTodo = newTodos?.find(t => t.id === todoId);
                    const oldTodo = oldTodos?.find(t => t.id === todoId);
                    return !todoEqual(newTodo, oldTodo);
                }

                // Pour les autres chemins, comparer directement les valeurs
                return newValue !== oldValue;
            }
        );

        this.todoId = todoId;

        this.equals = (oldTodos: Todo[], newTodos: Todo[]) => {
            const oldTodo = oldTodos?.find(t => t.id === todoId);
            const newTodo = newTodos?.find(t => t.id === todoId);

            return todoEqual(oldTodo, newTodo);
        };
    }

    // Memoized event handlers
    private handleBlur = useCallback((e: Event, id: string) => {
        saveEdit(id, (e.target as HTMLInputElement).value);
    }, []);

    private handleKeyUp = useCallback((e: KeyboardEvent, id: string) => {
        if (e.key === 'Enter') {
            saveEdit(id, (e.target as HTMLInputElement).value);
        } else if (e.key === 'Escape') {
            cancelEdit();
        }
    }, []);

    private handleToggle = useCallback((id: string) => {
        toggleTodo(id);
    }, []);

    private handleStartEdit = useCallback((id: string) => {
        startEditing(id);
    }, []);

    private handleDelete = useCallback((id: string) => {
        deleteTodo(id);
    }, []);

    private renderTodo(props: { todoId: string }): VirtualElement {
        const state = getCurrentState();
        const todo = state.todos.find(t => t.id === props.todoId);
        
        if (!todo) {
            return div(); // Todo supprimée
        }
        
        const isEditing = state.editingId === todo.id;

        if (isEditing) {
            return li({
                key: todo.id,
                class: ['completed', 'editing'].filter(cls =>
                    (cls === 'completed' && todo.completed) || cls === 'editing'
                )
            },
                input({
                    class: 'edit',
                    value: todo.text,
                    autofocus: true,
                    onBlur: (e: Event) => this.handleBlur(e, todo.id),
                    onKeyUp: (e: KeyboardEvent) => this.handleKeyUp(e, todo.id)
                })
            );
        }

        return li({
            key: todo.id,
            class: todo.completed ? 'completed' : ''
        },
            div({ class: 'view' },
                input({
                    class: 'toggle',
                    type: 'checkbox',
                    checked: todo.completed,
                    onChange: () => this.handleToggle(todo.id)
                }),
                label({
                    onDblClick: () => this.handleStartEdit(todo.id)
                }, todo.text),
                button({
                    class: 'destroy',
                    onClick: () => this.handleDelete(todo.id)
                })
            )
        );
    }
}

// Memoized version of TodoItemComponent for better performance
const MemoizedTodoItemComponent = memoizeReactiveComponent(
    TodoItemComponent,
    (prevArgs, nextArgs) => {
        // Only recreate if todoId changes
        return prevArgs[0] === nextArgs[0];
    }
);

// -----------------------------------------------
// Reactive Components for Toggle-All and Footer
// -----------------------------------------------

// Toggle-All Reactive Component
class ToggleAllComponent extends ReactiveComponent {
    constructor() {
        super(
            ['todos'],
            () => this.renderToggleAll(),
            {}
        );
    }

    private renderToggleAll(): VirtualElement {
        const state = getCurrentState();

        if (state.todos.length === 0) {
            return div(); // Empty when no todos
        }

        const allCompleted = state.todos.every(todo => todo.completed);

        return div(
            input({
                id: 'toggle-all',
                class: 'toggle-all',
                type: 'checkbox',
                checked: allCompleted,
                onChange: () => {
                    const visibleTodos = getFilteredTodos(state);
                    const allVisibleCompleted = visibleTodos.length > 0 && visibleTodos.every(todo => todo.completed);
                    const newCompletedState = !allVisibleCompleted;

                    const newTodos = state.todos.map(todo => ({ ...todo, completed: newCompletedState }));
                    updateBatchedState({ todos: newTodos });
                }
            }),
            label({ for: 'toggle-all' }, 'Mark all as complete')
        );
    }
}

// Stats Reactive Component
class StatsComponent extends ReactiveComponent {
    constructor() {
        super(
            ['todos'],
            () => this.renderStats(),
            {}
        );
    }

    private renderStats(): VirtualElement {
        const state = getCurrentState();
        const activeTodoCount = state.todos.filter(todo => !todo.completed).length;

        return span({ class: 'todo-count' },
            `${activeTodoCount} item${activeTodoCount !== 1 ? 's' : ''} left`
        );
    }
}

// Filters Reactive Component
class FiltersComponent extends ReactiveComponent {
    constructor() {
        super(
            ['filter'],
            () => this.renderFilters(),
            {}
        );
    }

    private renderFilters(): VirtualElement {
        const state = getCurrentState();

        return ul({ class: 'filters' },
            li(a({
                href: '#/',
                class: state.filter === 'all' ? 'selected' : '',
                onClick: (e: Event) => {
                    e.preventDefault();
                    navigateToLazy('/').catch(console.error);
                }
            }, 'All')),
            li(a({
                href: '#/active',
                class: state.filter === 'active' ? 'selected' : '',
                onClick: (e: Event) => {
                    e.preventDefault();
                    navigateToLazy('/active').catch(console.error);
                }
            }, 'Active')),
            li(a({
                href: '#/completed',
                class: state.filter === 'completed' ? 'selected' : '',
                onClick: (e: Event) => {
                    e.preventDefault();
                    navigateToLazy('/completed').catch(console.error);
                }
            }, 'Completed'))
        );
    }
}

// Clear Completed Reactive Component
class ClearCompletedComponent extends ReactiveComponent {
    constructor() {
        super(
            ['todos'],
            () => this.renderClearCompleted(),
            {}
        );
    }

    private renderClearCompleted(): VirtualElement {
        const state = getCurrentState();
        const completedTodoCount = state.todos.filter(todo => todo.completed).length;

        if (completedTodoCount === 0) {
            return span(); // Empty when no completed todos
        }

        return button({
            class: 'clear-completed',
            onClick: () => clearCompleted()
        }, 'Clear completed');
    }
}

// Create component instances
const toggleAllComponent = new ToggleAllComponent();
const statsComponent = new StatsComponent();
const filtersComponent = new FiltersComponent();
const clearCompletedComponent = new ClearCompletedComponent();

// -----------------------------------------------
// Lazy Router Setup
// -----------------------------------------------

// Lazy route components for filters
const allFilterLoader = () => Promise.resolve(() => {
    setFilter('all');
    return div(); // Return empty element, state update is the important part
});

const activeFilterLoader = () => Promise.resolve(() => {
    setFilter('active');
    return div();
});

const completedFilterLoader = () => Promise.resolve(() => {
    setFilter('completed');
    return div();
});

// Register lazy routes for filters (without immediate preload)
registerLazyRoute('/', allFilterLoader, { preload: false });
registerLazyRoute('/active', activeFilterLoader, { preload: false });
registerLazyRoute('/completed', completedFilterLoader, { preload: false });

// Preload the initial route immediately (current filter)
const initialHash = window.location.hash.slice(1) || '/';
preloadRoute(initialHash).catch(console.error);

// Initialize hash router to sync URL with filter state
function initFilterRouter(): void {
    // Handle hash changes
    const handleHashChange = () => {
        const hash = window.location.hash.slice(1) || '/';
        const filterMap: Record<string, Filter> = {
            '/': 'all',
            '/active': 'active',
            '/completed': 'completed'
        };

        const newFilter = filterMap[hash];
        if (newFilter && getCurrentState().filter !== newFilter) {
            setFilter(newFilter);
        }
    };

    window.addEventListener('hashchange', handleHashChange);

    // Set initial filter from URL
    handleHashChange();
}

// Initialize preloading strategies
function initPreloadingStrategies(): void {
    // Strategy 1: Hover Preloading
    // Preload routes when user hovers over filter links
    enableHoverPreloading();

    // Strategy 2: Idle Preloading
    // Preload remaining routes during browser idle time
    enableIdlePreloading();
}

// Gestionnaire de la liste des todos
class TodoListManager {
    private todoComponents = new Map<string, TodoItemComponent>();
    private listContainer: HTMLElement;
    private unsubscribe: (() => void) | null = null;
    
    constructor(container: HTMLElement) {
        this.listContainer = container;
        this.subscribeToTodoChanges();
    }
    
    private subscribeToTodoChanges(): void {
        // S'abonner aux changements de todos
        const todosUnsubscribe = globalStore.subscribeTo('todos', () => {
            const todos = getFilteredTodos();
            this.updateTodoList(todos);
        });
        
        // S'abonner aux changements de filtre
        const filterUnsubscribe = globalStore.subscribeTo('filter', () => {
            const todos = getFilteredTodos();
            this.updateTodoList(todos);
        });
        
        // Combiner les deux unsubscribe functions
        this.unsubscribe = () => {
            todosUnsubscribe();
            filterUnsubscribe();
        };
        
        // Rendu initial
        const todos = getFilteredTodos();
        this.updateTodoList(todos);
    }

    private updateTodoList(todos: Todo[]): void {
        // Supprimer les composants des todos qui n'existent plus
        this.todoComponents.forEach((component, id) => {
            if (!todos.find(t => t.id === id)) {
                component.unmount();
                this.todoComponents.delete(id);
                // Supprimer le container DOM
                const containers = this.listContainer.querySelectorAll(`[data-todo-id="${id}"]`);
                containers.forEach(container => container.remove());
            }
        });
        
        // Ajouter les nouveaux todos
        todos.forEach(todo => {
            if (!this.todoComponents.has(todo.id)) {
                const container = document.createElement('div');
                container.setAttribute('data-todo-id', todo.id);
                this.listContainer.appendChild(container);

                const component = new MemoizedTodoItemComponent(todo.id);
                component.mount(container);
                this.todoComponents.set(todo.id, component);
            }
        });
    }
    
    destroy(): void {
        this.todoComponents.forEach(component => component.unmount());
        this.todoComponents.clear();
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }
}

// Gestionnaire principal de l'application TodoMVC
class TodoAppManager {
    private listManager: TodoListManager | null = null;
    private footerUnsubscribe: (() => void) | null = null;
    private lazyComponentsMounted: boolean = false;

    // Memoized event handlers
    private handleNewTodoKeyUp = useCallback((e: KeyboardEvent) => {
        if (e.key !== 'Enter' || !(e.target instanceof HTMLInputElement)) return;

        const input = e.target as HTMLInputElement;
        const text = input.value.trim();

        if (text.length > 0) {
            addTodo(text);
        }

        input.value = '';
    }, []);

    constructor(private container: HTMLElement) {}
    
    // Initialiser l'application complète
    initialize(): void {
        this.createStaticStructure();

        const listContainer = document.getElementById('todo-list-container')!;
        this.listManager = new TodoListManager(listContainer);

        // Mount lazy components
        this.mountLazyComponents();

        // S'abonner aux changements pour mettre à jour la visibilité
        this.footerUnsubscribe = globalStore.subscribeTo('todos', () => {
            this.updateMainVisibility();
            this.updateFooterVisibility();
        });

        // Mise à jour initiale
        this.updateMainVisibility();
        this.updateFooterVisibility();
    }

    // Créer les éléments interactifs (input principal uniquement)
    private createInteractiveElements(): void {
        // Input principal
        const newTodoContainer = document.getElementById('new-todo-container')!;

        const newTodoInput = input({
            class: 'new-todo',
            placeholder: 'What needs to be done?',
            autofocus: true,
            onKeyUp: (e: KeyboardEvent) => {
                this.handleNewTodoKeyUp(e);
            }
        });
        newTodoContainer.appendChild(createDOMElement(newTodoInput));
    }


    // Créer la structure HTML de base
    private createStaticStructure(): void {
        this.container.innerHTML = `
            <div class="header">
                <h1>todos</h1>
                <div id="new-todo-container"></div>
            </div>
            <div class="main">
                <div id="toggle-all-container"></div>
                <ul class="todo-list" id="todo-list-container"></ul>
            </div>
            <div class="footer" id="footer-container">
                <div id="stats-container"></div>
                <div id="filters-container"></div>
                <div id="clear-completed-container"></div>
            </div>
        `;

        this.createInteractiveElements();
    }

    // Mount reactive components
    private mountLazyComponents(): void {
        const toggleAllContainer = document.getElementById('toggle-all-container')!;
        const statsContainer = document.getElementById('stats-container')!;
        const filtersContainer = document.getElementById('filters-container')!;
        const clearCompletedContainer = document.getElementById('clear-completed-container')!;

        toggleAllComponent.mount(toggleAllContainer);
        statsComponent.mount(statsContainer);
        filtersComponent.mount(filtersContainer);
        clearCompletedComponent.mount(clearCompletedContainer);

        this.lazyComponentsMounted = true;
    }
    
    // Mettre à jour la visibilité de la section principale
    private updateMainVisibility(): void {
        const state = getCurrentState();
        const mainSection = this.container.querySelector('.main') as HTMLElement;

        if (state.todos.length === 0) {
            mainSection.style.display = 'none';
        } else {
            mainSection.style.display = 'block';
        }
    }

    // Mettre à jour la visibilité du footer
    // Les lazy components gèrent leur propre contenu
    private updateFooterVisibility(): void {
        const state = getCurrentState();
        const footerContainer = document.getElementById('footer-container') as HTMLElement;

        if (state.todos.length === 0) {
            footerContainer.style.display = 'none';
        } else {
            footerContainer.style.display = 'block';
        }
    }
    
    // Nettoyer les ressources
    destroy(): void {
        this.listManager?.destroy();
        this.footerUnsubscribe?.();

        // Unmount reactive components
        if (this.lazyComponentsMounted) {
            toggleAllComponent.unmount();
            statsComponent.unmount();
            filtersComponent.unmount();
            clearCompletedComponent.unmount();
        }

        this.listManager = null;
        this.footerUnsubscribe = null;
        this.lazyComponentsMounted = false;
    }
}

// -----------------------------------------------

// ------------ Fonctions utilitaires ------------

// Récupérer l'état
function getCurrentState(): TodoState {
    return getState() as TodoState;
}

// Modifier l'état
function updateState(updates: Partial<TodoState>): void {
    setState({
        ...getCurrentState(),
        ...updates
    });
}

// Modifier l'état avec batching (pour les opérations en masse)
function updateBatchedState(updates: Partial<TodoState>): void {
    setBatchedState({
        ...getCurrentState(),
        ...updates
    });
}

// -----------------------------------------------

// ------------------- Actions -------------------

// Ajouter une todo
function addTodo(text: string): void {
    if (!text.trim().length) return;

    const newTodo: Todo = {
        id: generateId(),
        text,
        completed: false
    };

    updateState({ todos: [...getCurrentState().todos, newTodo] });
}

// Basculer l'état d'une todo
function toggleTodo(id: string): void {
    const currentTodos = getCurrentState().todos;
    const newTodos = currentTodos.map(todo => {
        if (todo.id === id) {
            return { ...todo, completed: !todo.completed };
        }
        return todo;
    });
    
    updateState({ todos: newTodos });
}

// Supprimer une todo
function deleteTodo(id: string): void {
    const currentTodos = getCurrentState().todos;
    const newTodos = currentTodos.filter(todo => todo.id !== id);
    
    updateState({ todos: newTodos });
}

// Changer le filtre
function setFilter(filter: Filter): void {
    updateState({ filter });
}

// Obtenir les todos filtrées
function getFilteredTodos(state?: TodoState): Todo[] {
    if (!state) state = getCurrentState();

    const todos = state.todos;
    const filter = state.filter;
    return (todos.filter(todo => {
        if (filter === 'all') return true;
        if (filter === 'active') return !todo.completed;
        if (filter === 'completed') return todo.completed;
        return true;
    }));
}

// Démarrer l'édition d'une todo
function startEditing(id: string): void {
    setState({ editingId: id });
}

// Sauvegarder les modifications
function saveEdit(id: string, newText: string): void {
    const trimmedText = newText.trim();

    if (trimmedText === '') {
        deleteTodo(id);
        return;
    }

    const currentTodos = getCurrentState().todos;
    const newTodos = currentTodos.map(todo => {
        if (todo.id === id) {
            return { ...todo, text: trimmedText };
        }
        return todo;
    });

    // Use batched state since we're updating both todos and editingId
    updateBatchedState({ todos: newTodos, editingId: null });
}

// Supprimer toutes les todos complétées
function clearCompleted(): void {
    const currentTodos = getCurrentState().todos;
    const newTodos = currentTodos.filter(todo => !todo.completed);

    // Use batched state since we're potentially removing multiple todos
    updateBatchedState({ todos: newTodos });
}

// Annuler l'édition
function cancelEdit(): void {
    setState({ editingId: null });
}

// -----------------------------------------------

// Initialiser l'application TodoMVC
initFilterRouter(); // Initialize lazy router first
initPreloadingStrategies(); // Enable preloading strategies
const appManager = new TodoAppManager(document.getElementById('todo-app')!);
appManager.initialize();