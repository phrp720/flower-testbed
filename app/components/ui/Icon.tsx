import {
    Alert01Icon,
    AlertCircleIcon,
    Analytics01Icon,
    Archive02Icon,
    ArrowLeft01Icon,
    ArrowRight01Icon,
    Attachment01Icon,
    Book02Icon,
    BotIcon,
    Brain02Icon,
    Cancel01Icon,
    CheckmarkCircle02Icon,
    ChipIcon,
    Clock01Icon,
    ComputerIcon,
    Copy01Icon,
    CpuIcon,
    Database01Icon,
    Delete02Icon,
    Download04Icon,
    PencilEdit02Icon,
    FileDownloadIcon,
    Flag02Icon,
    FlashIcon,
    FloppyDiskIcon,
    HardDriveIcon,
    HelpCircleIcon,
    InformationCircleIcon,
    Key01Icon,
    DashboardSquare02Icon,
    LinkSquare02Icon,
    Loading03Icon,
    Login01Icon,
    Logout01Icon,
    Message01Icon,
    MinusSignIcon,
    NeuralNetworkIcon,
    PauseIcon,
    PlayIcon,
    PlugSocketIcon,
    PlusSignIcon,
    Search01Icon,
    SentIcon,
    Settings02Icon,
    SparklesIcon,
    SquareIcon,
    TaskDone01Icon,
    TerminalIcon,
    TestTube01Icon,
    Tick02Icon,
    TradeDownIcon,
    TradeUpIcon,
    UserIcon,
    ViewIcon,
    ViewOffIcon,
    Wrench01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

/**
 * Every icon in the application, named for what it means rather than for what
 * it looks like.
 *
 * Components ask for `name="delete"`, never for a particular glyph, so the
 * icon set is swappable from this one file and the same concept cannot end up
 * drawn two different ways in two different places.
 */
const ICONS = {
    // navigation and structure
    dashboard: DashboardSquare02Icon,
    experiments: TestTube01Icon,
    chat: Message01Icon,
    settings: Settings02Icon,
    logout: Logout01Icon,
    login: Login01Icon,
    back: ArrowLeft01Icon,
    forward: ArrowRight01Icon,
    close: Cancel01Icon,
    add: PlusSignIcon,
    search: Search01Icon,

    // status
    success: CheckmarkCircle02Icon,
    check: Tick02Icon,
    warning: Alert01Icon,
    error: AlertCircleIcon,
    info: InformationCircleIcon,
    help: HelpCircleIcon,
    pending: Clock01Icon,
    spinner: Loading03Icon,

    // actions
    delete: Delete02Icon,
    edit: PencilEdit02Icon,
    download: Download04Icon,
    downloadFile: FileDownloadIcon,
    copy: Copy01Icon,
    save: FloppyDiskIcon,
    send: SentIcon,
    stop: SquareIcon,
    play: PlayIcon,
    pause: PauseIcon,
    view: ViewIcon,
    hide: ViewOffIcon,
    external: LinkSquare02Icon,
    attach: Attachment01Icon,

    // domain
    metrics: Analytics01Icon,
    checkpoint: Archive02Icon,
    storage: HardDriveIcon,
    round: Flag02Icon,
    cpu: CpuIcon,
    gpu: ChipIcon,
    device: ComputerIcon,
    network: NeuralNetworkIcon,
    database: Database01Icon,
    logs: TerminalIcon,
    tool: Wrench01Icon,
    thinking: Brain02Icon,
    agent: BotIcon,
    user: UserIcon,
    token: Key01Icon,
    connection: PlugSocketIcon,
    docs: Book02Icon,
    tasks: TaskDone01Icon,
    energy: FlashIcon,
    sparkle: SparklesIcon,

    // trend indicators
    up: TradeUpIcon,
    down: TradeDownIcon,
    flat: MinusSignIcon,
} satisfies Record<string, IconSvgElement>;

export type IconName = keyof typeof ICONS;

type Props = {
    name: IconName;
    /** Pixel size. Defaults to 16, which matches the body text it sits beside. */
    size?: number;
    className?: string;
    /**
     * Hairline strokes read as lighter and are what makes the set feel quiet.
     * Raise it only where an icon must hold its own against a solid fill.
     */
    strokeWidth?: number;
};

export default function Icon({ name, size = 16, className, strokeWidth = 1.5 }: Props) {
    return (
        <HugeiconsIcon
            icon={ICONS[name]}
            size={size}
            strokeWidth={strokeWidth}
            className={className}
            aria-hidden
        />
    );
}
