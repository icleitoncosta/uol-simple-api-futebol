

export interface UOLMatch {
    id: number;
    teams: {
        home: number;
        away: number;
    };
    championship: {
        name: string;
        editorialName: string;
    };
    date: string;
    hour: string;
    stadium: string;
    status: string;
    content: {
        broadcast: Array<{
            name: string;
            url?: string;
        }>;
    };
}

export interface UOLTeam {
    id: number;
    name: string;
    acronym: string;
    slug: string;
}