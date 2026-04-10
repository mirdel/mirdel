import { addCollection } from "@iconify/vue";
import gravityUiIcons from "@iconify-json/gravity-ui/icons.json";
import heroiconsIcons from "@iconify-json/heroicons/icons.json";
import iconamoonIcons from "@iconify-json/iconamoon/icons.json";
import lucideIcons from "@iconify-json/lucide/icons.json";
import mingcuteIcons from "@iconify-json/mingcute/icons.json";
import proiconsIcons from "@iconify-json/proicons/icons.json";

// Register icon collections locally so UIcon does not depend on runtime network fetch.
addCollection(lucideIcons);
addCollection(gravityUiIcons);
addCollection(heroiconsIcons);
addCollection(iconamoonIcons);
addCollection(mingcuteIcons);
addCollection(proiconsIcons);
